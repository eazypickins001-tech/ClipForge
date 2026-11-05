// Capturing a point on a zoom's path — the one piece of the keyframe UI that has two doors: the
// inspector's "Add keyframe" button and the keyframe button on the zoom pill in the timeline.
//
// It is here rather than in either component because the rule is the interesting part, and a second
// copy is a second chance to disagree about where "the playhead is inside the region" begins.
//
// The model is CAPTURE, not placement: the key takes the region's CURRENT focus AND its current zoom
// level, so the gimbal on the preview and the level control in the inspector are how a point is set
// up — change them, then capture. That is what keeps the preview overlay (which owns the drag) out of
// this entirely, and it is what makes a push-in two captures rather than a curve editor.

import type { AxcutZoomRegion } from "../schema";
import { effectiveZoomScale } from "./zoom-scale";

/** The region fields a capture reads: its window, where it looks, its level, and the path so far. */
export type KeyframeCaptureSource = Pick<
	AxcutZoomRegion,
	"startMs" | "endMs" | "focus" | "keyframes"
> &
	Pick<AxcutZoomRegion, "depth" | "customScale">;

/**
 * Where `timelineSec` falls inside the region, as 0..1, or null when it is outside.
 *
 * `at` is normalized inside the region, never absolute time — see `zoomKeyframeSchema`: regions are
 * resized and re-anchored constantly, and normalized keys survive that with no code.
 */
export function keyframeAtFor(
	region: Pick<AxcutZoomRegion, "startMs" | "endMs">,
	timelineSec: number,
): number | null {
	const startSec = region.startMs / 1000;
	const span = Math.max(1e-3, region.endMs / 1000 - startSec);
	const at = (timelineSec - startSec) / span;
	return at >= 0 && at <= 1 ? at : null;
}

/** Two captures this close together are one instant: repacing a key must replace it, not stack a
 *  duplicate the user then has to find and delete. */
const SAME_KEY_EPSILON = 0.005;

/**
 * The region's path with a key captured at `timelineSec`, sorted by `at`, or null when the playhead
 * is outside the region (nothing to capture against).
 *
 * The key records the level the viewer would see RIGHT NOW — `effectiveZoomScale`, so a `customScale`
 * outside the renderer's range is captured as the clamped value the picture actually shows, not as
 * the number sitting in the document. A capture therefore never writes a scale the compositor would
 * refuse.
 */
export function addZoomKeyframe(
	region: KeyframeCaptureSource,
	timelineSec: number,
): NonNullable<AxcutZoomRegion["keyframes"]> | null {
	const at = keyframeAtFor(region, timelineSec);
	if (at === null) return null;
	return [
		...(region.keyframes ?? []).filter((key) => Math.abs(key.at - at) > SAME_KEY_EPSILON),
		{
			at,
			cx: region.focus.cx,
			cy: region.focus.cy,
			scale: effectiveZoomScale(region),
		},
	].sort((a, b) => a.at - b.at);
}
