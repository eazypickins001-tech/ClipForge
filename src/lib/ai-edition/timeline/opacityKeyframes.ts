// F8's first property: a clip's opacity over its own source window.
//
// The keys are normalized INSIDE the clip (`at` 0..1), like a zoom's focus path, so trimming or
// splitting a clip moves its animation with it. `easing` shapes the segment that STARTS at a key;
// an absent easing is linear, which is every document written before F8.
//
// This module is the one place the interpolation rule lives. The compositor has to agree with it
// (`scene.rs::SceneClip::opacity_at`), so the tests below are the contract both sides are written
// against: before the first key the first value holds, after the last the last value holds, and a
// single key is a constant.

import type { AxcutClipPropertyKey, AxcutEasing } from "../schema";

export type OpacityEasing = AxcutEasing;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * CSS `cubic-bezier` progress: solve x(u) = t, return y(u). Bisection rather than Newton — 24
 * iterations are exact enough for a 0..1 curve and cannot diverge the way a Newton step can on a
 * flat control polygon.
 */
function cubicBezierProgress(x1: number, y1: number, x2: number, y2: number, t: number): number {
	const x = clamp01(t);
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const xAt = (u: number) => {
		const v = 1 - u;
		return 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u;
	};
	let lo = 0;
	let hi = 1;
	let u = 0.5;
	for (let i = 0; i < 24; i++) {
		u = (lo + hi) / 2;
		if (xAt(u) < x) lo = u;
		else hi = u;
	}
	const v = 1 - u;
	return 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u;
}

/** Progress through a segment, shaped by the key that starts it. */
export function easeOpacityProgress(easing: OpacityEasing | undefined, t: number): number {
	if (easing && typeof easing === "object") {
		return cubicBezierProgress(easing.x1, easing.y1, easing.x2, easing.y2, t);
	}
	switch (easing) {
		case "ease-in":
			return t * t;
		case "ease-out":
			return 1 - (1 - t) * (1 - t);
		case "ease-in-out":
			return t * t * (3 - 2 * t);
		default:
			return t;
	}
}

/** The opacity at `at` (0..1 inside the clip). No keys means fully opaque. */
export function sampleOpacity(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
): number {
	if (!keys || keys.length === 0) return 1;
	const x = clamp01(at);
	const sorted = [...keys].sort((a, b) => a.at - b.at);
	const first = sorted[0];
	if (x <= first.at) return clamp01(first.value);
	const last = sorted[sorted.length - 1];
	if (x >= last.at) return clamp01(last.value);
	for (let i = 1; i < sorted.length; i++) {
		const right = sorted[i];
		if (x > right.at) continue;
		const left = sorted[i - 1];
		const span = right.at - left.at;
		const t = span <= 1e-9 ? 1 : (x - left.at) / span;
		const progress = easeOpacityProgress(left.easing, t);
		return clamp01(left.value + (right.value - left.value) * progress);
	}
	return clamp01(last.value);
}

/** Where a SOURCE second falls inside the clip, as 0..1, or null when it is outside. */
export function opacityKeyAtFor(
	clip: Pick<{ sourceStartSec: number; sourceEndSec?: number }, "sourceStartSec" | "sourceEndSec">,
	sourceSec: number,
): number | null {
	const start = clip.sourceStartSec;
	const end = clip.sourceEndSec;
	if (end === undefined || end <= start + 1e-9) return null;
	const at = (sourceSec - start) / (end - start);
	return at >= 0 && at <= 1 ? at : null;
}

/** Two captures this close are one instant: repacing a key replaces it instead of stacking. */
export const SAME_OPACITY_KEY_EPSILON = 0.005;

/** Capture a value at `at`, keeping any easing the key already had. Sorted, one key per instant. */
export function setOpacityKey(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
	value: number,
): AxcutClipPropertyKey[] {
	const x = clamp01(at);
	const existing = (keys ?? []).find((key) => Math.abs(key.at - x) <= SAME_OPACITY_KEY_EPSILON);
	const key: AxcutClipPropertyKey = {
		at: x,
		value: clamp01(value),
		...(existing?.easing ? { easing: existing.easing } : {}),
	};
	return [...(keys ?? []).filter((k) => Math.abs(k.at - x) > SAME_OPACITY_KEY_EPSILON), key].sort(
		(a, b) => a.at - b.at,
	);
}

/** Drop the key at `at`, if there is one. An empty result means "no animation". */
export function removeOpacityKey(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
): AxcutClipPropertyKey[] {
	return (keys ?? []).filter((key) => Math.abs(key.at - at) > SAME_OPACITY_KEY_EPSILON);
}

/** The four easings a key can start, in menu order. `linear` is what an absent value means. */
export const KEY_EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;

/** Give the key at `at` a different easing. The value and position are untouched. */
export function setKeyEasing(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	at: number,
	easing: OpacityEasing,
): AxcutClipPropertyKey[] {
	return (keys ?? []).map((key) =>
		Math.abs(key.at - at) <= SAME_OPACITY_KEY_EPSILON
			? { ...key, easing: easing === "linear" ? undefined : easing }
			: key,
	);
}

/**
 * Move the key at `fromAt` to `toAt`, keeping its value and easing. Moving one onto another
 * replaces that key (one key per instant, the same rule as a capture). An unknown `fromAt` is a
 * no-op, so a stale row cannot invent a key.
 */
export function moveKey(
	keys: readonly AxcutClipPropertyKey[] | undefined,
	fromAt: number,
	toAt: number,
): AxcutClipPropertyKey[] {
	const source = (keys ?? []).find((key) => Math.abs(key.at - fromAt) <= SAME_OPACITY_KEY_EPSILON);
	if (!source) return [...(keys ?? [])];
	const moved = { ...source, at: clamp01(toAt) };
	return [
		...(keys ?? []).filter(
			(key) =>
				Math.abs(key.at - fromAt) > SAME_OPACITY_KEY_EPSILON &&
				Math.abs(key.at - moved.at) > SAME_OPACITY_KEY_EPSILON,
		),
		moved,
	].sort((a, b) => a.at - b.at);
}
