// The hesitation list, and the grouping the bulk action needs.
//
// The list is the judgement: which words count as fillers without reading the sentence around them.
// The cases that matter most are the ones it REFUSES, so they are pinned as hard as the ones it
// takes. Whether a hesitation may be CUT is a different rule, tested in `wordCuts.test.ts`.

import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { fillerWordIdsByAsset, isFillerWord } from "./fillerWords";

const transcript = (assetId: string, words: Array<[string, string]>) => ({
	assetId,
	language: "en",
	sourceDslPath: "t.dsl",
	sourceJsonPath: "t.json",
	segments: [],
	words: words.map(([id, text], index) => ({
		id,
		segmentId: "segment_1",
		startSec: index,
		endSec: index + 1,
		text,
	})),
});

function makeDoc(
	transcripts: ReturnType<typeof transcript>[],
	legacy: ReturnType<typeof transcript> | null = null,
): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_fillers",
			title: "Fillers",
			createdAt: "2026-11-02T00:00:00Z",
			updatedAt: "2026-11-02T00:00:00Z",
		},
		assets: transcripts.map((t) => ({
			id: t.assetId,
			kind: "video",
			label: `${t.assetId}.mp4`,
			originalPath: `/tmp/${t.assetId}.mp4`,
			durationSec: 100,
			video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
			cameraTrack: null,
		})),
		transcript: legacy,
		transcripts,
		timeline: {
			clips: [],
			gaps: [],
			trimRanges: [],
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

describe("isFillerWord", () => {
	it.each([
		["um", true],
		["Um", true],
		["UM,", true],
		["uh...", true],
		['"uh"', true],
		["umm", true],
		["Hmm", true],
		// Punctuation is dropped wherever it sits, so an interrupted hesitation still reads as one.
		["u—m", true],
		// Meaningful words that are fillers only in context. A word list cannot tell the two uses
		// apart, so these are left to the agent, which reads the sentence.
		["like", false],
		["so", false],
		["right", false],
		["actually", false],
		["basically", false],
		["you", false],
		["know", false],
		// An answer, not a hesitation.
		["uh-huh", false],
		["", false],
		["—", false],
		["OpenScreen", false],
	])("reads %j as %s", (text, expected) => {
		expect(isFillerWord(text)).toBe(expected);
	});
});

describe("fillerWordIdsByAsset", () => {
	it("collects the hesitations, grouped by the transcript they came from", () => {
		const doc = makeDoc([
			transcript("asset_1", [
				["w0", "Um,"],
				["w1", "so"],
				["w2", "uh"],
			]),
			transcript("asset_2", [["w0", "hmm"]]),
		]);
		expect(fillerWordIdsByAsset(doc)).toEqual([
			{ assetId: "asset_1", wordIds: ["w0", "w2"] },
			{ assetId: "asset_2", wordIds: ["w0"] },
		]);
	});

	it("keeps ids apart per asset, which is why the grouping exists", () => {
		// Word ids restart per asset: the same id names a different word in each transcript, and a
		// flat list would read as one word appearing twice.
		const doc = makeDoc([
			transcript("asset_1", [["w0", "um"]]),
			transcript("asset_2", [["w0", "yes"]]),
		]);
		expect(fillerWordIdsByAsset(doc)).toEqual([{ assetId: "asset_1", wordIds: ["w0"] }]);
	});

	it("drops a transcript with no hesitations in it", () => {
		const doc = makeDoc([transcript("asset_1", [["w0", "hello"]])]);
		expect(fillerWordIdsByAsset(doc)).toEqual([]);
	});

	it("reads the legacy single transcript without counting it twice", () => {
		const legacy = transcript("asset_1", [["w0", "um"]]);
		const doc = makeDoc([legacy], legacy);
		expect(fillerWordIdsByAsset(doc)).toEqual([{ assetId: "asset_1", wordIds: ["w0"] }]);
	});

	it("is empty with no transcript at all", () => {
		expect(fillerWordIdsByAsset(makeDoc([]))).toEqual([]);
	});
});
