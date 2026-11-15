// F8's transform properties: a clip's screen scale and position over its own source window.
//
// Same key shape and normalisation as opacity (`at` 0..1 inside the clip, easing on the segment
// that STARTS at a key), so splitting/trimming retimes them with the same helpers. The values are
// not 0..1, so this module has its own bounds and sampler instead of reusing `sampleOpacity`'s
// clamp; the interpolation rule is the same one, though, and the compositor must agree with it
// (`scene.rs::SceneClip::transform_at`).

import type { AxcutClip, AxcutClipPropertyKey } from "../schema";
import {
	easeOpacityProgress,
	opacityKeyAtFor,
	removeOpacityKey,
	SAME_OPACITY_KEY_EPSILON,
} from "./opacityKeyframes";

export const TRANSFORM_SCALE_MIN = 0.1;
export const TRANSFORM_SCALE_MAX = 2;
export const TRANSFORM_POSITION_MIN = -0.5;
export const TRANSFORM_POSITION_MAX = 0.5;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** The value at `at` (0..1 inside the clip), between `min`/`max`; `fallback` with no keys. */
export function sampleTransformValue(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
	fallback: number,
	min: number,
	max: number,
): number {
	if (!keys || keys.length === 0) return fallback;
	const x = Math.min(1, Math.max(0, at));
	const sorted = [...keys].sort((a, b) => a.at - b.at);
	const first = sorted[0];
	if (x <= first.at) return clamp(first.value, min, max);
	const last = sorted[sorted.length - 1];
	if (x >= last.at) return clamp(last.value, min, max);
	for (let i = 1; i < sorted.length; i++) {
		const right = sorted[i];
		if (x > right.at) continue;
		const left = sorted[i - 1];
		const span = right.at - left.at;
		const t = span <= 1e-9 ? 1 : (x - left.at) / span;
		const progress = easeOpacityProgress(left.easing, t);
		return clamp(left.value + (right.value - left.value) * progress, min, max);
	}
	return clamp(last.value, min, max);
}

export interface ClipTransform {
	scale: number;
	x: number;
	y: number;
}

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = { scale: 1, x: 0, y: 0 };

/** The screen's transform at a SOURCE second. Outside the clip's window, the edge key holds. */
export function sampleClipTransform(
	clip: Pick<
		AxcutClip,
		"sourceStartSec" | "sourceEndSec" | "scaleKeys" | "positionXKeys" | "positionYKeys"
	>,
	sourceSec: number,
): ClipTransform {
	const at = opacityKeyAtFor(clip, sourceSec) ?? (sourceSec < clip.sourceStartSec ? 0 : 1);
	return {
		scale: sampleTransformValue(
			clip.scaleKeys,
			at,
			DEFAULT_CLIP_TRANSFORM.scale,
			TRANSFORM_SCALE_MIN,
			TRANSFORM_SCALE_MAX,
		),
		x: sampleTransformValue(
			clip.positionXKeys,
			at,
			DEFAULT_CLIP_TRANSFORM.x,
			TRANSFORM_POSITION_MIN,
			TRANSFORM_POSITION_MAX,
		),
		y: sampleTransformValue(
			clip.positionYKeys,
			at,
			DEFAULT_CLIP_TRANSFORM.y,
			TRANSFORM_POSITION_MIN,
			TRANSFORM_POSITION_MAX,
		),
	};
}

/** Capture a value at `at`, keeping the easing the key already had. One key per instant. */
export function setTransformKey(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
	value: number,
	min: number,
	max: number,
): AxcutClipPropertyKey[] {
	const x = Math.min(1, Math.max(0, at));
	const existing = (keys ?? []).find((key) => Math.abs(key.at - x) <= SAME_OPACITY_KEY_EPSILON);
	const key: AxcutClipPropertyKey = {
		at: x,
		value: clamp(value, min, max),
		...(existing?.easing ? { easing: existing.easing } : {}),
	};
	return [...(keys ?? []).filter((k) => Math.abs(k.at - x) > SAME_OPACITY_KEY_EPSILON), key].sort(
		(a, b) => a.at - b.at,
	);
}

export { removeOpacityKey as removeTransformKey };
