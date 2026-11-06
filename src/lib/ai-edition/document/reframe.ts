// Reframing a recording for a different output format: one crop per clip, taken from the source and
// centred on whatever the author already framed.
//
// The model is the same one the Edit modal's crop uses, so nothing new has to be invented: a clip's
// `cropRegion` is a window over the SOURCE, normalized 0..1, and the layout fits that window into the
// output canvas. Make the window the canvas's shape and the fit is 1:1 — no bars, no letterbox —
// which is exactly what "reframe for vertical" means here. The output format is a separate write
// (`setAspectRatio`); this module only decides the windows.

import type { AxcutClip, AxcutDocument, AxcutZoomRegion } from "../schema";

/** A crop region in source space. `undefined` on a clip means the full frame. */
export type ReframeCrop = NonNullable<AxcutClip["cropRegion"]>;

/**
 * `"9:16"` → `9 / 16`. Returns null for a token this cannot read, so a caller can refuse the whole
 * request instead of cropping to a ratio it invented.
 *
 * Both orders are accepted (`16:9` and `9:16`) and the number is width/height: 16:9 is wider than
 * tall, 9:16 taller than wide. `"auto"` — the format that follows the first clip — has no fixed
 * ratio and is refused here for that reason.
 */
export function parseAspectRatioToken(token: string): number | null {
	const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(token);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!(width > 0) || !(height > 0)) return null;
	return width / height;
}

/** Farthest a crop origin may sit, so the window stays inside the source. */
function clampOrigin(origin: number, extent: number): number {
	return Math.min(Math.max(0, origin), Math.max(0, 1 - extent));
}

/**
 * The window over `sourceWidth × sourceHeight` that matches `target`, centred as close to `centre`
 * as the source allows.
 *
 * The SHORT side is kept and the long one is trimmed, which is the only way to hit the target without
 * showing anything the source does not have: a 16:9 source in a 9:16 frame keeps its full height and
 * gives up width. A source that has no probed dimensions cannot be reframed at all — the caller gets
 * null rather than a crop that would be right only by luck.
 */
export function reframeCrop(input: {
	sourceWidth: number;
	sourceHeight: number;
	target: { width: number; height: number };
	/** Where to look, in source space. `{ cx: 0.5, cy: 0.5 }` is the middle of the frame. */
	centre: { cx: number; cy: number };
}): ReframeCrop | null {
	const { sourceWidth, sourceHeight, target, centre } = input;
	if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
	if (!(target.width > 0) || !(target.height > 0)) return null;
	const sourceRatio = sourceWidth / sourceHeight;
	const targetRatio = target.width / target.height;
	// A target WIDER than the source trims height; a target TALLER trims width. Equal is the identity,
	// and the clamp below then keeps the whole frame.
	const width = targetRatio >= sourceRatio ? 1 : targetRatio / sourceRatio;
	const height = targetRatio >= sourceRatio ? sourceRatio / targetRatio : 1;
	return {
		x: clampOrigin(centre.cx - width / 2, width),
		y: clampOrigin(centre.cy - height / 2, height),
		width,
		height,
	};
}

/**
 * Where the author was ALREADY looking, over a clip's span: the average of the focus points of the
 * zooms placed there, or the middle of the frame when there are none.
 *
 * This is the honest stand-in for "follow the action" that needs no telemetry: if the project already
 * zooms on something, that something is the subject, and a reframe should not cut it off. It does not
 * read the cursor track, so a recording full of movement but with no zooms is centred rather than
 * tracked — the caller must say so rather than implying it followed anything.
 */
export function authoredCentreFor(
	document: AxcutDocument,
	clip: AxcutClip,
): { cx: number; cy: number; from: "authored" | "centre" } {
	const start = clip.timelineStartSec;
	const end = clip.timelineEndSec;
	const overlapping = (document.zoomRanges ?? []).filter((region) => {
		const regionStart = region.startMs / 1000;
		const regionEnd = region.endMs / 1000;
		return regionEnd > start && regionStart < end;
	});
	if (overlapping.length === 0) return { cx: 0.5, cy: 0.5, from: "centre" };
	const sum = overlapping.reduce(
		(acc, region) => ({ cx: acc.cx + region.focus.cx, cy: acc.cy + region.focus.cy }),
		{ cx: 0, cy: 0 },
	);
	return {
		cx: sum.cx / overlapping.length,
		cy: sum.cy / overlapping.length,
		from: "authored",
	};
}

/**
 * The source dimensions a reframe needs: `asset.video.width` / `.height`, the same raw probe
 * `largestClipDims` (schema) and `calculateEffectiveSourceDimensions` (outputFormat) read. No other
 * shape is consulted on purpose — a second reader is a second answer, and the ratio decides the crop.
 *
 * Null when the probe never landed, which the caller reports rather than guesses: a crop computed
 * from a guessed 16:9 would be right only by luck.
 */
export function sourceDimensionsFor(
	document: AxcutDocument,
	clip: AxcutClip,
): { width: number; height: number } | null {
	const asset = document.assets.find((candidate) => candidate.id === clip.assetId);
	const video = (asset as { video?: { width?: number; height?: number } } | undefined)?.video;
	const width = Number(video?.width ?? 0);
	const height = Number(video?.height ?? 0);
	if (!(width > 0) || !(height > 0)) return null;
	return { width, height };
}

/** The zooms over one clip's span — exported for the report the tool returns, so a caller can say
 *  whether a clip was centred on something authored or merely on the middle. */
export function zoomsOverClip(document: AxcutDocument, clip: AxcutClip): AxcutZoomRegion[] {
	return (document.zoomRanges ?? []).filter(
		(region) =>
			region.endMs / 1000 > clip.timelineStartSec && region.startMs / 1000 < clip.timelineEndSec,
	);
}

/** One clip's share of a reframe. */
export interface ReframeEntry {
	clipId: string;
	assetId: string;
	crop: ReframeCrop;
	/** Whether the window was centred on something the author framed, or on the middle of the frame. */
	centredOn: "authored" | "centre";
}

/**
 * The crops that reframe a timeline for `target`, or the reason none could be computed.
 *
 * All-or-nothing on purpose. A reframe that crops three clips and leaves the fourth in its original
 * shape is not a smaller reframe, it is a broken one — the format does not change halfway down the
 * timeline — so one clip without probed dimensions refuses the whole request and says so. The caller
 * writes the crops and the output format together, or writes neither.
 */
export function planReframe(
	document: AxcutDocument,
	target: { width: number; height: number },
	assetId?: string,
): { entries: ReframeEntry[] } | { refused: string } {
	const clips = document.timeline.clips.filter(
		(clip) => assetId === undefined || clip.assetId === assetId,
	);
	if (clips.length === 0) {
		return {
			refused:
				assetId === undefined
					? "The timeline has no clips, so there is nothing to reframe."
					: `No clip uses asset ${assetId}, so there is nothing to reframe.`,
		};
	}
	const entries: ReframeEntry[] = [];
	for (const clip of clips) {
		const source = sourceDimensionsFor(document, clip);
		if (!source) {
			return {
				refused: `Clip ${clip.id} has no probed dimensions yet, so its crop cannot be computed — and reframing only some clips would leave the format changing mid-timeline. Nothing was changed.`,
			};
		}
		const centre = authoredCentreFor(document, clip);
		const crop = reframeCrop({
			sourceWidth: source.width,
			sourceHeight: source.height,
			target,
			centre,
		});
		if (!crop) {
			return {
				refused: `Clip ${clip.id} could not be cropped for that format. Nothing was changed.`,
			};
		}
		entries.push({ clipId: clip.id, assetId: clip.assetId, crop, centredOn: centre.from });
	}
	return { entries };
}
