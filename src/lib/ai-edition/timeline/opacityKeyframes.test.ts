import { describe, expect, it } from "vitest";
import {
	easeOpacityProgress,
	moveKey,
	opacityKeyAtFor,
	removeOpacityKey,
	sampleOpacity,
	setKeyEasing,
	setOpacityKey,
} from "./opacityKeyframes";

describe("sampleOpacity", () => {
	it("is fully opaque with no keys", () => {
		expect(sampleOpacity(undefined, 0.5)).toBe(1);
		expect(sampleOpacity([], 0.5)).toBe(1);
	});

	it("holds the first value before the first key and the last after the last", () => {
		const keys = [
			{ at: 0.25, value: 0.2 },
			{ at: 0.75, value: 0.8 },
		];
		expect(sampleOpacity(keys, 0)).toBe(0.2);
		expect(sampleOpacity(keys, 0.25)).toBe(0.2);
		expect(sampleOpacity(keys, 0.75)).toBe(0.8);
		expect(sampleOpacity(keys, 1)).toBe(0.8);
	});

	it("interpolates linearly by default", () => {
		expect(
			sampleOpacity(
				[
					{ at: 0, value: 0 },
					{ at: 1, value: 1 },
				],
				0.25,
			),
		).toBeCloseTo(0.25);
	});

	it("uses the easing of the key that starts the segment", () => {
		const keys = [
			{ at: 0, value: 0, easing: "ease-in" as const },
			{ at: 1, value: 1 },
		];
		expect(sampleOpacity(keys, 0.5)).toBeCloseTo(0.25);
	});

	it("is a constant for a single key", () => {
		expect(sampleOpacity([{ at: 0.4, value: 0.3 }], 0)).toBe(0.3);
		expect(sampleOpacity([{ at: 0.4, value: 0.3 }], 1)).toBe(0.3);
	});

	it("tolerates unsorted keys", () => {
		const keys = [
			{ at: 0.8, value: 0.9 },
			{ at: 0.2, value: 0.1 },
		];
		expect(sampleOpacity(keys, 0.5)).toBeCloseTo(0.5);
	});
});

describe("easeOpacityProgress", () => {
	it("pins both ends for every easing", () => {
		for (const easing of ["linear", "ease-in", "ease-out", "ease-in-out"] as const) {
			expect(easeOpacityProgress(easing, 0)).toBeCloseTo(0);
			expect(easeOpacityProgress(easing, 1)).toBeCloseTo(1);
		}
	});

	it("solves a custom cubic-bezier like CSS", () => {
		const linear = { x1: 0, y1: 0, x2: 1, y2: 1 };
		expect(easeOpacityProgress(linear, 0.25)).toBeCloseTo(0.25, 4);
		expect(easeOpacityProgress(linear, 0.75)).toBeCloseTo(0.75, 4);

		const symmetric = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
		expect(easeOpacityProgress(symmetric, 0.5)).toBeCloseTo(0.5, 2);
		expect(easeOpacityProgress(symmetric, 0)).toBe(0);
		expect(easeOpacityProgress(symmetric, 1)).toBe(1);
	});
});

describe("setOpacityKey", () => {
	it("replaces a key at the same instant instead of stacking", () => {
		const first = setOpacityKey(undefined, 0.5, 0.2);
		const second = setOpacityKey(first, 0.503, 0.9);
		expect(second).toHaveLength(1);
		expect(second[0].value).toBeCloseTo(0.9);
	});

	it("keeps the easing a key already had", () => {
		const keys = setOpacityKey([{ at: 0, value: 1, easing: "ease-out" }], 0, 0.2);
		expect(keys[0].easing).toBe("ease-out");
	});

	it("sorts by position", () => {
		const keys = setOpacityKey(setOpacityKey(undefined, 0.8, 0.1), 0.2, 0.9);
		expect(keys.map((key) => key.at)).toEqual([0.2, 0.8]);
	});
});

describe("opacityKeyAtFor", () => {
	const clip = { sourceStartSec: 10, sourceEndSec: 20 };

	it("maps a source second inside the clip to 0..1", () => {
		expect(opacityKeyAtFor(clip, 15)).toBeCloseTo(0.5);
	});

	it("is null outside the window or with no span", () => {
		expect(opacityKeyAtFor(clip, 9)).toBeNull();
		expect(opacityKeyAtFor(clip, 21)).toBeNull();
		expect(opacityKeyAtFor({ sourceStartSec: 5, sourceEndSec: 5 }, 5)).toBeNull();
	});
});

describe("removeOpacityKey", () => {
	it("drops the key at that instant", () => {
		const keys = [
			{ at: 0.2, value: 0.5 },
			{ at: 0.8, value: 0.5 },
		];
		expect(removeOpacityKey(keys, 0.8)).toHaveLength(1);
	});
});

describe("setKeyEasing", () => {
	it("changes only the key at that instant", () => {
		const keys = [
			{ at: 0.2, value: 0.5 },
			{ at: 0.8, value: 0.5 },
		];
		const next = setKeyEasing(keys, 0.8, "ease-out");
		expect(next[0].easing).toBeUndefined();
		expect(next[1].easing).toBe("ease-out");
	});

	it("writes linear as absent, so a linear key is byte-identical to a pre-easing one", () => {
		const next = setKeyEasing([{ at: 0.2, value: 0.5, easing: "ease-in" }], 0.2, "linear");
		expect(next[0]).toEqual({ at: 0.2, value: 0.5 });
	});

	it("stores a custom bezier as the curve itself", () => {
		const curve = { x1: 0.2, y1: 0, x2: 0.8, y2: 1 };
		const next = setKeyEasing([{ at: 0.5, value: 0.3 }], 0.5, curve);
		expect(next[0].easing).toEqual(curve);
	});
});

describe("moveKey", () => {
	it("moves the key, keeps its value and easing, and sorts", () => {
		const keys = [
			{ at: 0.2, value: 0.5, easing: "ease-out" as const },
			{ at: 0.8, value: 0.9 },
		];
		const next = moveKey(keys, 0.8, 0.4);
		expect(next).toEqual([
			{ at: 0.2, value: 0.5, easing: "ease-out" },
			{ at: 0.4, value: 0.9 },
		]);
	});

	it("replaces a key it lands on, and is a no-op for an unknown source", () => {
		const keys = [
			{ at: 0.2, value: 0.5 },
			{ at: 0.8, value: 0.9 },
		];
		expect(moveKey(keys, 0.8, 0.2)).toEqual([{ at: 0.2, value: 0.9 }]);
		expect(moveKey(keys, 0.5, 0.6)).toEqual(keys);
	});
});
