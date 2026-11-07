import { playbackOverlaps, readSpeedSpans } from "@/lib/ai-edition/document/timeline";
import type { AxcutClip, AxcutDocument, AxcutTransition } from "@/lib/ai-edition/schema";
import { projectRegionsToSource } from "@/lib/ai-edition/timeline/timelineMap";
import { isBlendKind } from "@/lib/ai-edition/timeline/transitionOverlap";
import {
	clipProgrammeEndSec,
	clipSourceEndAtProgrammeSec,
	type OutputFrameSpeedRegion,
} from "@/lib/exporter/outputFrameCount";
import type { CompositorClipInput } from "./contracts";

/** The dip a clip's composed frame is ramped through at a boundary. */
export type ClipVideoDip = NonNullable<CompositorClipInput["videoDip"]>;

/** The blend a clip dissolves IN from. */
export type ClipIncomingBlend = NonNullable<CompositorClipInput["incomingBlend"]>;

/**
 * The per-clip video dip that a clip's own transition and its neighbour's ask for. `fadeInSec`
 * comes from the transition on this clip's LEFT edge, `fadeOutSec` from the one on the NEXT
 * clip's; half the duration lands on each side of the cut, so a 500 ms dip is a 250 ms ramp down
 * and a 250 ms ramp up.
 *
 * Pure, and cheap: a clip with no transition on either side gets no entry, and therefore no
 * `videoDip` at all — which is what keeps every project written before transitions rendering
 * byte-identically.
 *
 * Lives in its own module rather than beside `buildNativeClipList` because the export dialog
 * keeps a second copy of the clip list and its tests mock `@/native/sceneDescription` wholesale;
 * importing from here means both callers share ONE implementation and neither test had to grow a
 * mock. That drift already cost a bug once — the dialog shipped `hasAudio: true` for a year of
 * commits — so the two lists sharing a helper is the point, not a detail.
 */
export function clipVideoDips(
	document: AxcutDocument,
	clips: Array<{ id: string }>,
): Map<string, ClipVideoDip> {
	const index = new Map(clips.map((clip, i) => [clip.id, i]));
	const dips = new Map<string, ClipVideoDip>();
	const add = (clipId: string, patch: Partial<ClipVideoDip>) => {
		const current = dips.get(clipId) ?? { fadeInSec: 0, fadeOutSec: 0, color: "#000000" };
		dips.set(clipId, { ...current, ...patch });
	};
	for (const transition of document.transitions ?? []) {
		const half = transition.durationMs / 2000;
		const color = transitionColor(transition);
		if (transition.side === "out") {
			// The programme's own tail. Anywhere else this would be the next clip's `in` written a
			// second time, so the last clip is the only place it is honoured.
			if (clips[clips.length - 1]?.id === transition.clipId) {
				add(transition.clipId, { fadeOutSec: half, color });
			}
			continue;
		}
		const at = index.get(transition.clipId);
		if (at === undefined) continue;
		add(transition.clipId, { fadeInSec: half, color });
		const previous = clips[at - 1];
		if (previous) add(previous.id, { fadeOutSec: half, color });
	}
	return dips;
}

/** The colour a dip passes through. Black unless the transition says otherwise. */
export function transitionColor(transition: AxcutTransition): string {
	if (transition.kind === "dip-white") return "#ffffff";
	if (transition.kind === "dip-color") return transition.color ?? "#000000";
	return "#000000";
}

/**
 * The blend each clip dissolves IN from, keyed by the clip that FOLLOWS the cut — the same edge
 * `clipVideoDips` writes `fadeInSec` on, and emitted from the same two clip lists for the same
 * reason.
 *
 * The duration is the CLAMPED overlap `playbackOverlaps` reports, NOT `transition.durationMs / 1000`:
 * a 3 s dissolve between two 1 s clips overlaps by 0.5 s, and a blend that ran for the authored 3 s
 * would drift out of the window the programme actually opened — two clips' worth of material in a
 * half-second gap. Reading it off the programme also means the walk never re-derives the clamp in
 * Rust, where it would be a second implementation of the same rule.
 *
 * A dip asks for nothing: its duration is already carried by `videoDip`, and overlapping for one
 * would shorten the video for an effect that does not need it.
 */
export function clipIncomingBlends(
	document: AxcutDocument,
	clips: Array<{ id: string }>,
): Map<string, ClipIncomingBlend> {
	const blends = new Map<string, ClipIncomingBlend>();
	const present = new Set(clips.map((clip) => clip.id));
	const requested = (document.transitions ?? []).filter(
		(transition) =>
			transition.side !== "out" && isBlendKind(transition.kind) && present.has(transition.clipId),
	);
	if (requested.length === 0) {
		// The same property the dips rest on: a project with no blend transition emits no
		// `incomingBlend` at all, so its payload and its render are what they were.
		return blends;
	}
	const overlaps = playbackOverlaps(
		document.timeline.clips,
		document.timeline.trimRanges,
		document.transitions,
	);
	for (const transition of requested) {
		const durationSec = overlaps.get(transition.clipId) ?? 0;
		// Zero means the clamp refused the boundary (a neighbour with no kept length left). A blend
		// window of no seconds is a hard cut, so emit nothing rather than a zero-length pass.
		if (durationSec > 0) {
			blends.set(transition.clipId, { kind: transition.kind, durationSec });
		}
	}
	return blends;
}

/**
 * Source seconds to cut from each clip's TAIL because the clip AFTER it blends in over that much
 * PROGRAMME time — the frame-grid half of the overlap `clipIncomingBlends` describes.
 *
 * A blend really does cost the programme `d`: the incoming clip opens `d` earlier, so the outgoing
 * keeps its head and loses its tail. The compositor's freeze-frame blend then holds the outgoing's
 * last COMPOSED frame over the incoming's opening, and the walk's frame count drops by exactly the
 * frames those seconds produced. Shortening the window here is what makes the export, its
 * `outputFrameCount` progress total and its scene's programme clock agree without a second
 * implementation in Rust. The LIVE PREVIEW deliberately does not use this: its transport and
 * playhead run on the raw ruler, so it keeps the full windows and the blend it was watched with.
 *
 * Reads the CLAMPED overlap back from `clipIncomingBlends`, so a boundary the programme refused
 * (a neighbour with nothing left) trims nothing — the same fail-closed rule the drawn blend uses.
 * Under a speed region the trim is not `d` source seconds: `clipSourceEndAtProgrammeSec` inverts
 * the speed arithmetic, so a 2× tail loses TWO source seconds per programme second.
 *
 * `resolvedEnds` is `resolveClipSourceEndSec` per clip — the same effective end the clip list
 * emits, not the raw `sourceEndSec` a not-yet-probed clip may not have.
 */
export function clipBlendTailTrims(
	document: AxcutDocument,
	clips: AxcutClip[],
	resolvedEnds: readonly number[],
): number[] {
	const trims = clips.map(() => 0);
	const blends = clipIncomingBlends(document, clips);
	if (blends.size === 0) return trims;
	const regions: OutputFrameSpeedRegion[] = projectRegionsToSource(
		readSpeedSpans(document),
		clips,
		document.timeline.clips,
		() => "speed",
	).map((region) => ({
		startSec: region.startMs / 1000,
		endSec: region.endMs / 1000,
		speed: region.speed,
		clipIndex: region.clipIndex,
	}));
	for (let index = 1; index < clips.length; index += 1) {
		const overlap = blends.get(clips[index].id)?.durationSec ?? 0;
		if (!(overlap > 0)) continue;
		const previous = clips[index - 1];
		const previousEnd = resolvedEnds[index - 1];
		if (!(previousEnd > previous.sourceStartSec)) continue;
		const ownRegions = regions.filter(
			(region) => region.clipIndex === undefined || region.clipIndex === index - 1,
		);
		const window = { sourceStartSec: previous.sourceStartSec, sourceEndSec: previousEnd };
		const naturalEnd = clipProgrammeEndSec(window, ownRegions, 0);
		const trimmedEnd = clipSourceEndAtProgrammeSec(
			window,
			ownRegions,
			0,
			Math.max(0, naturalEnd - overlap),
		);
		trims[index - 1] = Math.max(0, previousEnd - trimmedEnd);
	}
	return trims;
}
