import { describe, expect, it } from "vitest";
import {
	expandCurvedRegion,
	isSpeedCurvePreset,
	SPEED_CURVE_MAX_STEPS,
	SPEED_CURVE_PRESETS,
	type SpeedCurvePreset,
	speedMultiplierAt,
} from "./speedCurve";

const PRESETS: SpeedCurvePreset[] = [...SPEED_CURVE_PRESETS];

describe("speedMultiplierAt", () => {
	it("runs 1× → peak on the accelerating ramp and peak → 1× on the other", () => {
		expect(speedMultiplierAt("ramp-up", 0, 3)).toBeCloseTo(1, 10);
		expect(speedMultiplierAt("ramp-up", 1, 3)).toBeCloseTo(3, 10);
		expect(speedMultiplierAt("ramp-down", 0, 3)).toBeCloseTo(3, 10);
		expect(speedMultiplierAt("ramp-down", 1, 3)).toBeCloseTo(1, 10);
	});

	it("holds 1× at the ends and the peak in the middle of a hump", () => {
		expect(speedMultiplierAt("peak", 0, 4)).toBeCloseTo(1, 10);
		expect(speedMultiplierAt("peak", 0.5, 4)).toBeCloseTo(4, 10);
		expect(speedMultiplierAt("peak", 1, 4)).toBeCloseTo(1, 10);
		// The trough is the mirror: the region's speed at the ends, 1× in the middle.
		expect(speedMultiplierAt("valley", 0, 4)).toBeCloseTo(4, 10);
		expect(speedMultiplierAt("valley", 0.5, 4)).toBeCloseTo(1, 10);
		expect(speedMultiplierAt("valley", 1, 4)).toBeCloseTo(4, 10);
	});

	it("stays between 1× and the peak, for a fast and for a slow region", () => {
		for (const preset of PRESETS) {
			for (const peak of [0.25, 0.5, 1, 2, 8]) {
				const [lo, hi] = peak >= 1 ? [1, peak] : [peak, 1];
				for (let i = 0; i <= 40; i++) {
					const m = speedMultiplierAt(preset, i / 40, peak);
					expect(m).toBeGreaterThanOrEqual(lo - 1e-9);
					expect(m).toBeLessThanOrEqual(hi + 1e-9);
				}
			}
		}
	});

	it("climbs monotonically on the accelerating ramp", () => {
		let previous = -Infinity;
		for (let i = 0; i <= 40; i++) {
			const m = speedMultiplierAt("ramp-up", i / 40, 4);
			expect(m).toBeGreaterThanOrEqual(previous - 1e-9);
			previous = m;
		}
	});

	it("is symmetric about the middle for a hump", () => {
		for (let i = 0; i <= 20; i++) {
			const u = i / 20;
			expect(speedMultiplierAt("peak", u, 5)).toBeCloseTo(speedMultiplierAt("peak", 1 - u, 5), 10);
		}
	});

	it("only accepts the known shapes", () => {
		expect(isSpeedCurvePreset("peak")).toBe(true);
		expect(isSpeedCurvePreset("wobble")).toBe(false);
		expect(isSpeedCurvePreset(undefined)).toBe(false);
		expect(isSpeedCurvePreset(3)).toBe(false);
	});
});

describe("expandCurvedRegion", () => {
	const region = { id: "sp1", startMs: 1000, endMs: 4500, speed: 3, curve: "ramp-up" as const };

	it("covers the region exactly and contiguously, with unique ids", () => {
		const spans = expandCurvedRegion(region);
		expect(spans.length).toBeGreaterThan(1);
		expect(spans[0]?.startMs).toBeCloseTo(region.startMs, 9);
		expect(spans.at(-1)?.endMs).toBeCloseTo(region.endMs, 9);
		for (let i = 1; i < spans.length; i++) {
			expect(spans[i]?.startMs).toBeCloseTo(spans[i - 1]?.endMs ?? Number.NaN, 9);
		}
		expect(new Set(spans.map((s) => s.id)).size).toBe(spans.length);
	});

	it("is deterministic — the arithmetic and the emit must agree", () => {
		expect(expandCurvedRegion(region)).toEqual(expandCurvedRegion(region));
	});

	it("keeps the step count inside its bounds", () => {
		const tiny = expandCurvedRegion({ ...region, endMs: region.startMs + 8 });
		expect(tiny).toHaveLength(1);
		const huge = expandCurvedRegion({ ...region, endMs: region.startMs + 600_000 });
		expect(huge).toHaveLength(SPEED_CURVE_MAX_STEPS);
	});

	it("approximates the exact ∫1/speed well", () => {
		const spans = expandCurvedRegion(region);
		const approx = spans.reduce((sec, s) => sec + (s.endMs - s.startMs) / 1000 / s.speed, 0);
		// A very fine midpoint reference.
		const n = 20_000;
		const lenSec = (region.endMs - region.startMs) / 1000;
		let exact = 0;
		for (let i = 0; i < n; i++) {
			exact += lenSec / n / speedMultiplierAt(region.curve, (i + 0.5) / n, region.speed);
		}
		expect(Math.abs(approx - exact)).toBeLessThan(1e-3);
	});

	it("expands nothing for a region with no length", () => {
		expect(expandCurvedRegion({ ...region, endMs: region.startMs })).toEqual([]);
	});
});
