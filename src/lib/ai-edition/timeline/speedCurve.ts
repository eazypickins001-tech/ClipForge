// A speed RAMP: a speed region whose multiplier varies across the region instead of holding one
// value. A constant region already exists (`SpeedRegion.speed`); this adds a named shape on top of
// it, so a take can accelerate into a beat or ease out of one.
//
// The whole feature is an approximation done in ONE place, on purpose. The native compositor
// integrates a speed region as `Σ (length / speed)` over CONSTANT spans (`speed_segments_for_window`
// in `crates/compositor/src/regions.rs`, mirrored by `outputFrameCount.ts`), and it never learns a
// curve exists: `expandCurvedRegion` discretises the shape into constant sub-spans here, and every
// reader — the emit and the programme arithmetic alike — consumes that same expansion. Two
// consequences worth keeping in mind:
//
//  - The ramp is a STAIRCASE, at `SPEED_CURVE_STEP_SEC` of source per step. A finer step costs more
//    spans in the scene payload, a coarser one becomes visible as a stutter. One constant, one place.
//  - The discretisation DEFINES the region's programme length (a midpoint-rule Riemann sum). Because
//    TS and the scene both read it here, they cannot disagree about the frame grid — the failure the
//    handover calls "the time grid is the risk, not the GPU".
//
// A region with no curve is not expanded at all (see `readSpeedSpans`), so every document written
// before this file emits exactly the payload it always did.

/** The ramp shapes a region can carry. Named by what the SPEED does across the region, with the
 *  region's own `speed` as the peak (or trough, below 1×). The endpoints are always 1×, which is
 *  what makes a ramp read as a ramp rather than as two regions glued together. */
export const SPEED_CURVE_PRESETS = ["ramp-up", "ramp-down", "peak", "valley"] as const;

export type SpeedCurvePreset = (typeof SPEED_CURVE_PRESETS)[number];

/** Whether a stored value is one of the known shapes. A region whose `curve` is anything else is
 *  treated as having none — an unknown shape must not silently pick one. */
export function isSpeedCurvePreset(value: unknown): value is SpeedCurvePreset {
	return typeof value === "string" && (SPEED_CURVE_PRESETS as readonly string[]).includes(value);
}

/** Source seconds per step. ~1 output frame at 30 fps: fine enough that a step is under a frame,
 *  coarse enough that a long ramp stays a handful of hundred spans. */
export const SPEED_CURVE_STEP_SEC = 1 / 30;

/** Ceiling on steps per region, so a pathological length cannot flood the scene payload. A region
 *  long enough to hit this gets a coarser staircase rather than a bigger JSON. */
export const SPEED_CURVE_MAX_STEPS = 300;

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite smoothstep: zero slope at both ends, so a ramp meets its 1× endpoints without a kink. */
function smoothstep(u: number): number {
	const t = clamp01(u);
	return t * t * (3 - 2 * t);
}

/** 0 at the ends, 1 in the middle — the shape a hump/trough is built on. */
function triangle(u: number): number {
	return 1 - Math.abs(2 * clamp01(u) - 1);
}

/**
 * The multiplier at the fraction `u` (0 = the region's start, 1 = its end) of a region whose
 * peak/trough is `peak`. Always between `1` and `peak`, inclusive, whichever side of 1 `peak` is.
 */
export function speedMultiplierAt(preset: SpeedCurvePreset, u: number, peak: number): number {
	switch (preset) {
		case "ramp-up":
			return 1 + (peak - 1) * smoothstep(u);
		case "ramp-down":
			return peak + (1 - peak) * smoothstep(u);
		case "peak":
			return 1 + (peak - 1) * smoothstep(triangle(u));
		case "valley":
			return peak + (1 - peak) * smoothstep(triangle(u));
	}
}

/** A constant-speed span, the only shape the compositor and the programme arithmetic understand. */
export interface SpeedSpan {
	id: string;
	startMs: number;
	endMs: number;
	speed: number;
}

/**
 * Cut a curved region into equal sub-spans, each carrying the multiplier at its MIDPOINT (the
 * midpoint rule: the error falls as 1/n², so a modest step count is already close to the exact
 * integral `∫ 1/speed`). Deterministic — same input, same spans — because the programme arithmetic
 * and the emitted scene both call it and must agree down to the frame.
 *
 * A region with no length expands to nothing rather than to a zero-width span.
 */
export function expandCurvedRegion(region: {
	id: string;
	startMs: number;
	endMs: number;
	speed: number;
	curve: SpeedCurvePreset;
}): SpeedSpan[] {
	const lenMs = region.endMs - region.startMs;
	if (!(lenMs > 0) || !Number.isFinite(region.speed) || region.speed <= 0) return [];
	const steps = Math.min(
		SPEED_CURVE_MAX_STEPS,
		Math.max(1, Math.round(lenMs / 1000 / SPEED_CURVE_STEP_SEC)),
	);
	const stepMs = lenMs / steps;
	const spans: SpeedSpan[] = [];
	for (let i = 0; i < steps; i++) {
		const startMs = region.startMs + i * stepMs;
		const endMs = i === steps - 1 ? region.endMs : region.startMs + (i + 1) * stepMs;
		spans.push({
			id: `${region.id}#${i}`,
			startMs,
			endMs,
			speed: speedMultiplierAt(region.curve, (i + 0.5) / steps, region.speed),
		});
	}
	return spans;
}
