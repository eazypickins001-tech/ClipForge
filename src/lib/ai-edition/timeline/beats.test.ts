import { describe, expect, it } from "vitest";
import { beatsForClip, detectBeats } from "./beats";

const BLOCKS_PER_SEC = 200;

/** A min/max peak track: a click at every `beatEverySec`, quiet elsewhere. */
function clickTrack(durationSec: number, beatEverySec: number, beatLevel = 1, floor = 0.01) {
	const blocks = Math.ceil(durationSec * BLOCKS_PER_SEC);
	const peaks = new Float32Array(blocks * 2);
	for (let i = 0; i < blocks; i++) {
		const t = i / BLOCKS_PER_SEC;
		const onBeat = Math.abs(t / beatEverySec - Math.round(t / beatEverySec)) < 0.5 / BLOCKS_PER_SEC;
		const level = onBeat ? beatLevel : floor;
		peaks[i * 2] = -level;
		peaks[i * 2 + 1] = level;
	}
	return peaks;
}

describe("detectBeats", () => {
	it("finds a 120 BPM click track", () => {
		const { beats, bpm } = detectBeats(clickTrack(4, 0.5), 4);
		expect(bpm).toBe(120);
		// Four seconds → seven interior onsets (the click at 0 has no rise before it).
		expect(beats.length).toBeGreaterThanOrEqual(6);
		for (const beat of beats) {
			expect(Math.abs(beat / 0.5 - Math.round(beat / 0.5))).toBeLessThan(0.06);
		}
	});

	it("finds a 90 BPM click track", () => {
		const { bpm } = detectBeats(clickTrack(6, 60 / 90), 6);
		expect(bpm).toBe(90);
	});

	it("does not invent beats in a steady signal", () => {
		const blocks = 4 * BLOCKS_PER_SEC;
		const peaks = new Float32Array(blocks * 2);
		for (let i = 0; i < blocks; i++) {
			peaks[i * 2] = -0.5;
			peaks[i * 2 + 1] = 0.5;
		}
		expect(detectBeats(peaks, 4).beats).toEqual([]);
	});

	it("returns nothing for a missing or degenerate track", () => {
		expect(detectBeats(new Float32Array(0), 4)).toEqual({ beats: [], bpm: null });
		expect(detectBeats(new Float32Array(16), 0)).toEqual({ beats: [], bpm: null });
	});
});

describe("beatsForClip", () => {
	const track = { startSec: 0, endSec: 10, offsetSec: 0 };
	const clip = {
		timelineStartSec: 0,
		timelineEndSec: 4,
		sourceStartSec: 12,
		sourceEndSec: 16,
	};

	it("maps beats into the clip's source clock", () => {
		expect(beatsForClip([0.5, 1, 1.5, 2, 3.5], track, clip)).toEqual([12.5, 13, 13.5, 14, 15.5]);
	});

	it("moves with the track placement and its source offset", () => {
		const placed = { startSec: 2, endSec: 12, offsetSec: 0.5 };
		// Beat 1 is at timeline 2.5; the clip starts at timeline 2, so that is source 12.5.
		expect(
			beatsForClip([1, 1.5, 2], placed, { ...clip, timelineStartSec: 2, timelineEndSec: 6 }),
		).toEqual([12.5, 13, 13.5]);
	});

	it("keeps only beats inside the track and clip, and away from the edges", () => {
		expect(beatsForClip([0.5, 4.05, 9, 10.5], track, clip)).toEqual([12.5]);
	});
});
