import type { AxcutDocument, AxcutTransition } from "@/lib/ai-edition/schema";
import type { CompositorClipInput } from "./contracts";

/** The dip a clip's composed frame is ramped through at a boundary. */
export type ClipVideoDip = NonNullable<CompositorClipInput["videoDip"]>;

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
