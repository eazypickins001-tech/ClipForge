// `resolvePlaybackSegments` with transitions: a BLEND shortens the programme and makes the two
// spans overlap, and every other kind leaves the contiguous programme exactly as it was.
//
// The compatibility test at the bottom is the one that matters for everything else in the app: the
// third argument is optional, so a caller that does not pass transitions must get byte-identical
// segments to before. That is what let this land without touching a single existing fixture.

import { describe, expect, it } from "vitest";
import type { AxcutClip, AxcutTransition } from "../schema";
import { resolvePlaybackSegments } from "./timeline";

function clip(id: string, startSec: number, endSec: number): AxcutClip {
	return {
		id,
		assetId: `asset_${id}`,
		sourceStartSec: startSec,
		sourceEndSec: endSec,
		timelineStartSec: startSec,
		timelineEndSec: endSec,
		wordRefs: [],
		origin: "user",
		reason: "",
	} as AxcutClip;
}

function blend(clipId: string, durationMs: number): AxcutTransition {
	return { id: `t_${clipId}`, clipId, side: "in", kind: "dissolve", durationMs } as AxcutTransition;
}

function dip(clipId: string, durationMs: number): AxcutTransition {
	return {
		id: `d_${clipId}`,
		clipId,
		side: "in",
		kind: "dip-black",
		durationMs,
	} as AxcutTransition;
}

const spans = (clips: AxcutClip[], transitions?: AxcutTransition[]) =>
	resolvePlaybackSegments(clips, [], transitions).map((s) => [
		s.timelineStartSec,
		s.timelineEndSec,
	]);

const TWO = [clip("a", 0, 10), clip("b", 10, 20)];

describe("resolvePlaybackSegments and a blend boundary", () => {
	it("overlaps the two clips by the transition's duration, shortening the programme", () => {
		expect(spans(TWO, [blend("b", 1000)])).toEqual([
			[0, 10],
			[9, 19],
		]);
	});

	it("leaves a dip boundary contiguous — a dip costs the programme nothing", () => {
		expect(spans(TWO, [dip("b", 1000)])).toEqual([
			[0, 10],
			[10, 20],
		]);
	});

	it("ignores a transition on the programme's own tail", () => {
		const out = { ...blend("b", 1000), side: "out" } as AxcutTransition;
		expect(spans(TWO, [out])).toEqual([
			[0, 10],
			[10, 20],
		]);
	});

	it("clamps the overlap to half the shorter neighbour", () => {
		// 3 s asked for between two 2 s clips: each side can only pay 1 s before it is gone.
		const short = [clip("a", 0, 2), clip("b", 2, 4)];
		expect(spans(short, [blend("b", 3000)])).toEqual([
			[0, 2],
			[1, 3],
		]);
	});

	it("clamps against the KEPT length, not the declared one", () => {
		// A trim takes b down to 1 s kept, so the clamp is half of 1 s even though the clip
		// declares 2 s. The trim is source time, on b's own media.
		const clips = [clip("a", 0, 10), clip("b", 10, 12)];
		const trims = [{ id: "trim", assetId: "asset_b", clipId: "b", startSec: 11, endSec: 12 }];
		const segs = resolvePlaybackSegments(clips, trims as never, [blend("b", 3000)]);
		// b keeps 10 → 11, so the clamp is 0.5 s and b starts at 9.5.
		expect(segs.map((s) => [s.timelineStartSec, s.timelineEndSec])).toEqual([
			[0, 10],
			[9.5, 10.5],
		]);
	});

	it("does not double-book a clip between two dissolves", () => {
		// b is 1 s long and dissolves on both sides. The boundary before it may claim half of that
		// (the half clamp), so the boundary after it only gets what is left — never the same
		// material twice, which would fold the programme onto itself.
		const three = [clip("a", 0, 10), clip("b", 10, 11), clip("c", 11, 21)];
		const [a, b, c] = resolvePlaybackSegments(three, [], [blend("b", 1000), blend("c", 1000)]);
		expect(a.timelineStartSec).toBe(0);
		// 0.5 s of b's head goes to the first boundary.
		expect(b.timelineStartSec).toBeCloseTo(9.5, 6);
		// b ends at 10.5; the second boundary gets the 0.5 s b has left, so c starts at 10.
		expect(c.timelineStartSec).toBeCloseTo(10, 6);
	});
});

describe("resolvePlaybackSegments without transitions", () => {
	it("is byte-identical to the contiguous programme every caller already relies on", () => {
		const withArg = resolvePlaybackSegments(TWO, [], []);
		const withoutArg = resolvePlaybackSegments(TWO, []);
		expect(withArg).toEqual(withoutArg);
		expect(spans(TWO)).toEqual([
			[0, 10],
			[10, 20],
		]);
	});
});
