// The overlap arithmetic a cross-dissolve adds to the programme. Everything that computes programme
// time reads this, so the edges are pinned here before a single clip moves: which kinds overlap, and
// the three clamps that stop a dissolve from erasing a clip or double-booking one.

import { describe, expect, it } from "vitest";
import { blendOverlapSec, isBlendKind } from "./transitionOverlap";

const at = (over: Partial<Parameters<typeof blendOverlapSec>[0]> = {}) =>
	blendOverlapSec({
		kind: "dissolve",
		durationMs: 500,
		outgoingKeptSec: 10,
		incomingKeptSec: 10,
		alreadyConsumedSec: 0,
		...over,
	});

describe("isBlendKind", () => {
	it("takes every family that moves both pictures and leaves the dips alone", () => {
		expect(isBlendKind("dissolve")).toBe(true);
		expect(isBlendKind("wipe-from-left")).toBe(true);
		expect(isBlendKind("wipe-from-bottom")).toBe(true);
		expect(isBlendKind("slide-from-top")).toBe(true);
		expect(isBlendKind("slide-from-right")).toBe(true);
		// A dip is modelled inside the clip; overlapping for one would shorten the video for nothing.
		expect(isBlendKind("dip-black")).toBe(false);
		expect(isBlendKind("dip-white")).toBe(false);
		expect(isBlendKind("dip-color")).toBe(false);
		expect(isBlendKind(undefined)).toBe(false);
	});
});

describe("blendOverlapSec", () => {
	it("is the duration, in seconds", () => {
		expect(at()).toBe(0.5);
	});

	it("is nothing for a dip, a missing kind or a zero duration", () => {
		expect(at({ kind: "dip-black" })).toBe(0);
		expect(at({ kind: undefined })).toBe(0);
		expect(at({ durationMs: 0 })).toBe(0);
		expect(at({ durationMs: undefined })).toBe(0);
	});

	it("never takes more than half of the shorter neighbour", () => {
		// A 3 s dissolve between two 1 s clips would erase the lot; each side only pays half.
		expect(at({ durationMs: 3000, outgoingKeptSec: 1, incomingKeptSec: 1 })).toBe(0.5);
		// The shorter neighbour is the incoming one here.
		expect(at({ durationMs: 3000, outgoingKeptSec: 10, incomingKeptSec: 2 })).toBe(1);
	});

	it("leaves room for a dissolve on the other side of the same clip", () => {
		// The outgoing clip already gave 0.8 s of its head to the previous boundary, and only has
		// 1 s to give in total: the second dissolve gets the 0.2 s that is left.
		expect(at({ outgoingKeptSec: 1, alreadyConsumedSec: 0.8, durationMs: 500 })).toBeCloseTo(
			0.2,
			6,
		);
	});

	it("is nothing once the outgoing clip is fully spoken for", () => {
		expect(at({ outgoingKeptSec: 1, alreadyConsumedSec: 1 })).toBe(0);
		expect(at({ outgoingKeptSec: 1, alreadyConsumedSec: 5 })).toBe(0);
	});

	it("is nothing when a neighbour has no kept length at all", () => {
		// A clip trimmed away entirely cannot host half of a dissolve.
		expect(at({ outgoingKeptSec: 0 })).toBe(0);
		expect(at({ incomingKeptSec: 0 })).toBe(0);
	});
});
