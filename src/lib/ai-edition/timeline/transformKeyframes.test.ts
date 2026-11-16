import { describe, expect, it } from "vitest";
import { moveKey } from "./opacityKeyframes";
import {
	DEFAULT_CLIP_TRANSFORM,
	sampleClipTransform,
	sampleTransformValue,
	setTransformKey,
	TRANSFORM_POSITION_MAX,
	TRANSFORM_POSITION_MIN,
	TRANSFORM_SCALE_MAX,
	TRANSFORM_SCALE_MIN,
} from "./transformKeyframes";

const clip = (patch: Record<string, unknown> = {}) => ({
	sourceStartSec: 10,
	sourceEndSec: 20,
	...patch,
});

describe("sampleTransformValue", () => {
	it("returns the fallback without keys and clamps every value", () => {
		expect(sampleTransformValue([], 0.5, 1, 0.1, 2)).toBe(1);
		expect(
			sampleTransformValue([{ at: 0, value: 9 }], 0.5, 1, TRANSFORM_SCALE_MIN, TRANSFORM_SCALE_MAX),
		).toBe(2);
		expect(
			sampleTransformValue(
				[{ at: 0, value: -9 }],
				0.5,
				0,
				TRANSFORM_POSITION_MIN,
				TRANSFORM_POSITION_MAX,
			),
		).toBe(-0.5);
	});

	it("holds before the first key and after the last", () => {
		const keys = [
			{ at: 0.25, value: 1.5 },
			{ at: 0.75, value: 0.5 },
		];
		expect(sampleTransformValue(keys, 0, 1, 0.1, 2)).toBe(1.5);
		expect(sampleTransformValue(keys, 1, 1, 0.1, 2)).toBe(0.5);
	});

	it("uses the easing of the key that starts the segment", () => {
		expect(
			sampleTransformValue(
				[
					{ at: 0, value: 1, easing: "ease-in" },
					{ at: 1, value: 2 },
				],
				0.5,
				1,
				0.1,
				2,
			),
		).toBeCloseTo(1.25);
	});
});

describe("sampleClipTransform", () => {
	it("maps the source clock into the clip's own 0..1 window", () => {
		const c = clip({
			scaleKeys: [
				{ at: 0, value: 1 },
				{ at: 1, value: 2 },
			],
			positionXKeys: [{ at: 0, value: 0 }],
			positionYKeys: [{ at: 0, value: -0.25 }],
		});
		expect(sampleClipTransform(c, 10)).toEqual({ scale: 1, x: 0, y: -0.25, rotation: 0 });
		expect(sampleClipTransform(c, 15).scale).toBeCloseTo(1.5);
		expect(sampleClipTransform(c, 20).scale).toBe(2);
		expect(sampleClipTransform(c, 5)).toEqual({ scale: 1, x: 0, y: -0.25, rotation: 0 });
		expect(sampleClipTransform(clip(), 15)).toEqual(DEFAULT_CLIP_TRANSFORM);
	});

	it("passes rotation through in degrees", () => {
		const c = clip({
			rotationKeys: [
				{ at: 0, value: -45 },
				{ at: 1, value: 45 },
			],
		});
		expect(sampleClipTransform(c, 10).rotation).toBe(-45);
		expect(sampleClipTransform(c, 15).rotation).toBeCloseTo(0);
		expect(sampleClipTransform(c, 20).rotation).toBe(45);
	});
});

describe("setTransformKey", () => {
	it("captures a clamped key, replaces the same instant and keeps its easing", () => {
		const first = setTransformKey([], 0.2, 9, 0.1, 2);
		expect(first).toEqual([{ at: 0.2, value: 2 }]);
		const eased = setTransformKey([{ ...first[0], easing: "ease-out" }], 0.2, 1.5, 0.1, 2);
		expect(eased).toEqual([{ at: 0.2, value: 1.5, easing: "ease-out" }]);
	});

	it("moves a key and drops it on the floor like opacity's", () => {
		const keys = setTransformKey([], 0.2, 1.2, 0.1, 2);
		expect(moveKey(keys, 0.2, 0.5)).toEqual([{ at: 0.5, value: 1.2 }]);
	});
});
