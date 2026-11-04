// Long pauses, derived from the gaps between words. The cases that matter are the ones it REFUSES:
// a short gap (cutting those is what makes silence removal sound chopped), a gap no single clip owns,
// one already cut, and the leading/trailing dead air this deliberately leaves alone.

import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { findSilenceCuts, MIN_SILENCE_SEC } from "./silenceCuts";

const clip = (id: string, sourceStartSec: number, sourceEndSec: number) => ({
	id,
	assetId: "asset_1",
	sourceStartSec,
	sourceEndSec,
	timelineStartSec: sourceStartSec,
	timelineEndSec: sourceEndSec,
	wordRefs: [],
	origin: "user" as const,
	reason: "",
});

const word = (id: string, startSec: number, endSec: number, source?: string) => ({
	id,
	segmentId: "segment_1",
	startSec,
	endSec,
	text: id,
	...(source ? { source } : {}),
});

function makeDoc(
	words: ReturnType<typeof word>[],
	options: { clips?: ReturnType<typeof clip>[]; trimRanges?: unknown[]; generated?: boolean } = {},
): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_silence",
			title: "Silence",
			createdAt: "2026-11-02T00:00:00Z",
			updatedAt: "2026-11-02T00:00:00Z",
		},
		assets: [
			{
				id: "asset_1",
				kind: "video",
				label: "take.mp4",
				originalPath: "/tmp/take.mp4",
				durationSec: 10,
				video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
				cameraTrack: null,
			},
		],
		transcript: null,
		transcripts: [
			{
				assetId: "asset_1",
				language: "en",
				sourceDslPath: "t.dsl",
				sourceJsonPath: "t.json",
				segments: [],
				words,
			},
		],
		timeline: {
			clips: options.clips ?? [clip("clip_1", 0, 10)],
			gaps: [],
			trimRanges: options.trimRanges ?? [],
			muteRanges: [],
			speedRanges: [],
			captionRanges: [],
		},
		annotations: [],
		zoomRanges: [],
		shaderEffectRanges: [],
		audioTracks: [],
		legacyEditor: null,
	} as unknown as AxcutDocument;
}

describe("findSilenceCuts", () => {
	it("cuts an interior pause, as the gap between two spoken words", () => {
		const doc = makeDoc([word("w0", 0, 0.5), word("w1", 3, 3.5)]);
		expect(findSilenceCuts(doc)).toEqual([
			{ assetId: "asset_1", clipId: "clip_1", startSec: 0.5, endSec: 3 },
		]);
	});

	it("leaves ordinary gaps between words alone", () => {
		// 200 ms is how speech sounds; cutting it is what makes a rough cut stutter.
		const doc = makeDoc([word("w0", 0, 0.5), word("w1", 0.7, 1.2)]);
		expect(findSilenceCuts(doc)).toEqual([]);
	});

	it("counts a pause exactly at the threshold", () => {
		const doc = makeDoc([word("w0", 0, 0.5), word("w1", 0.5 + MIN_SILENCE_SEC, 2)]);
		expect(findSilenceCuts(doc)).toHaveLength(1);
	});

	it("leaves dead air at the head and tail of the clip alone", () => {
		// Two seconds of nothing, then speech, then six and a half seconds of nothing. Moving the
		// clip's in/out point is a different edit — it changes what the clip IS rather than cutting a
		// hole in it — so only the (short) interior gap between the words is even a candidate.
		const doc = makeDoc([word("w0", 2, 2.5), word("w1", 2.8, 3.3)]);
		expect(findSilenceCuts(doc)).toEqual([]);
	});

	it("skips a pause no single clip fully owns", () => {
		// Two clips with a source gap between them; the pause straddles both, so a cut has nowhere
		// to sit.
		const doc = makeDoc([word("w0", 1, 1.5), word("w1", 5, 5.5)], {
			clips: [clip("clip_a", 0, 2), clip("clip_b", 4, 10)],
		});
		expect(findSilenceCuts(doc)).toEqual([]);
	});

	it("skips a pause an existing cut already covers", () => {
		const doc = makeDoc([word("w0", 0, 0.5), word("w1", 3, 3.5)], {
			trimRanges: [
				{
					id: "trim_1",
					assetId: "asset_1",
					clipId: "clip_1",
					startSec: 0.5,
					endSec: 3,
					origin: "user",
					reason: "",
				},
			],
		});
		expect(findSilenceCuts(doc)).toEqual([]);
	});

	it("reads words the transcriber synthesised as not spoken", () => {
		const doc = makeDoc([word("w0", 0, 0.5), word("w1", 3, 3.5, "synth")]);
		expect(findSilenceCuts(doc)).toEqual([]);
	});

	it("orders the words itself rather than trusting the transcript's order", () => {
		const doc = makeDoc([word("w1", 3, 3.5), word("w0", 0, 0.5)]);
		expect(findSilenceCuts(doc)).toEqual([
			{ assetId: "asset_1", clipId: "clip_1", startSec: 0.5, endSec: 3 },
		]);
	});

	it("is empty with no transcript at all", () => {
		expect(findSilenceCuts({ ...makeDoc([]), transcripts: [] })).toEqual([]);
	});
});
