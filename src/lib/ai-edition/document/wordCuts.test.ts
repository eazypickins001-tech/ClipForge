// The shared word-cut rule: which words may be cut, how they fold into cuts, and the one-document
// write a bulk action uses. The agent's `removeWords` tool reads the same plan, so the cases that
// matter are the ones that must be REFUSED — if these drift, the agent and the button start
// disagreeing about what is cuttable.

import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { applyWordCutRuns, groupWordCutRuns, planWordCuts, wordCutRunsToTrims } from "./wordCuts";

const clip = (id: string, assetId: string, sourceStartSec: number, sourceEndSec: number) => ({
	id,
	assetId,
	sourceStartSec,
	sourceEndSec,
	timelineStartSec: sourceStartSec,
	timelineEndSec: sourceEndSec,
	wordRefs: [],
	origin: "user" as const,
	reason: "",
});

const transcript = (
	assetId: string,
	words: Array<{ id: string; text: string; startSec: number; endSec: number; source?: string }>,
) => ({
	assetId,
	language: "en",
	sourceDslPath: "t.dsl",
	sourceJsonPath: "t.json",
	segments: [],
	words: words.map((word) => ({
		segmentId: "segment_1",
		...word,
	})),
});

function makeDoc(
	transcripts: ReturnType<typeof transcript>[],
	options: { clips?: ReturnType<typeof clip>[]; trimRanges?: unknown[] } = {},
): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_wordcuts",
			title: "Word cuts",
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
		transcript: null,
		transcripts,
		timeline: {
			clips: options.clips ?? [clip("clip_1", "asset_1", 0, 100)],
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

const WORDS = [
	{ id: "w0", text: "um", startSec: 0, endSec: 0.4 },
	{ id: "w1", text: "hello", startSec: 1, endSec: 1.6 },
	{ id: "w2", text: "uh", startSec: 2, endSec: 2.3 },
];

const ids = () => {
	let n = 0;
	return () => `trim_new_${++n}`;
};

describe("planWordCuts", () => {
	it("resolves a word to the clip whose source holds it", () => {
		const { targets, rejected } = planWordCuts(makeDoc([transcript("asset_1", WORDS)]), [
			"w0",
			"w2",
		]);
		expect(rejected).toEqual([]);
		expect(targets).toEqual([
			{
				wordId: "w0",
				assetId: "asset_1",
				clipId: "clip_1",
				text: "um",
				index: 0,
				startSec: 0,
				endSec: 0.4,
			},
			{
				wordId: "w2",
				assetId: "asset_1",
				clipId: "clip_1",
				text: "uh",
				index: 2,
				startSec: 2,
				endSec: 2.3,
			},
		]);
	});

	it("says which reason refused each word, rather than throwing", () => {
		const doc = makeDoc([
			transcript("asset_1", [
				...WORDS,
				{ id: "w_synth", text: "um", startSec: 3, endSec: 3.4, source: "synth" },
				{ id: "w_backwards", text: "um", startSec: 5, endSec: 4 },
			]),
		]);
		expect(planWordCuts(doc, ["nope", "w_synth", "w_backwards"]).rejected).toEqual([
			{ wordId: "nope", reason: "unknown" },
			{ wordId: "w_synth", reason: "no-source" },
			{ wordId: "w_backwards", reason: "bad-timestamps" },
		]);
	});

	it("reads a repeated id as ambiguous until the asset is named", () => {
		// Word ids restart per asset, so the same id in two transcripts is not one word. Both assets
		// need a clip of their own, or the named lookup would fail for a different reason.
		const doc = makeDoc(
			[
				transcript("asset_1", [{ id: "w0", text: "um", startSec: 0, endSec: 0.4 }]),
				transcript("asset_2", [{ id: "w0", text: "uh", startSec: 0, endSec: 0.4 }]),
			],
			{ clips: [clip("clip_1", "asset_1", 0, 100), clip("clip_2", "asset_2", 0, 100)] },
		);
		expect(planWordCuts(doc, ["w0"]).rejected).toEqual([{ wordId: "w0", reason: "ambiguous" }]);
		expect(planWordCuts(doc, ["w0"], "asset_2").targets.map((t) => t.assetId)).toEqual(["asset_2"]);
	});

	it("refuses a word no single clip fully contains, and says how many were found", () => {
		const doc = makeDoc(
			[transcript("asset_1", [{ id: "w0", text: "um", startSec: 4.5, endSec: 5.5 }])],
			{
				clips: [clip("clip_a", "asset_1", 0, 5), clip("clip_b", "asset_1", 6, 10)],
			},
		);
		expect(planWordCuts(doc, ["w0"]).rejected).toEqual([
			{ wordId: "w0", reason: "not-in-one-clip", clipCount: 0 },
		]);
	});

	it("refuses a word an existing cut already covers", () => {
		const doc = makeDoc([transcript("asset_1", WORDS)], {
			trimRanges: [
				{
					id: "trim_1",
					assetId: "asset_1",
					clipId: "clip_1",
					startSec: 0,
					endSec: 0.5,
					origin: "user",
					reason: "",
				},
			],
		});
		expect(planWordCuts(doc, ["w0"]).rejected).toEqual([{ wordId: "w0", reason: "already-cut" }]);
	});
});

describe("groupWordCutRuns", () => {
	it("folds words that follow one another into ONE cut", () => {
		// Cutting a phrase word by word would leave the gaps between its words playing.
		const targets = planWordCuts(makeDoc([transcript("asset_1", WORDS)]), [
			"w0",
			"w1",
			"w2",
		]).targets;
		const runs = groupWordCutRuns(targets);
		expect(runs).toHaveLength(1);
		expect(runs[0].wordIds).toEqual(["w0", "w1", "w2"]);
		expect(runs[0].startSec).toBe(0);
		expect(runs[0].endSec).toBe(2.3);
	});

	it("keeps a word with a kept word between it and the next as its own cut", () => {
		const targets = planWordCuts(makeDoc([transcript("asset_1", WORDS)]), ["w0", "w2"]).targets;
		expect(groupWordCutRuns(targets)).toHaveLength(2);
	});

	it("never folds across two clips", () => {
		// w1 sits in the first clip and w2 in the second: neighbours in the transcript, but two cuts,
		// because a cut belongs to one clip. The first clip has to contain w1 entirely (ends 1.6).
		const doc = makeDoc([transcript("asset_1", WORDS)], {
			clips: [clip("clip_a", "asset_1", 0, 2), clip("clip_b", "asset_1", 2, 100)],
		});
		const runs = groupWordCutRuns(planWordCuts(doc, ["w1", "w2"]).targets);
		expect(runs.map((run) => run.clipId)).toEqual(["clip_a", "clip_b"]);
	});
});

describe("applyWordCutRuns", () => {
	it("writes every cut in ONE document, so the bulk action is one undo step", () => {
		const doc = makeDoc([transcript("asset_1", WORDS)]);
		const runs = groupWordCutRuns(planWordCuts(doc, ["w0", "w2"]).targets);
		const next = applyWordCutRuns(doc, runs, "Remove filler words", ids());

		expect(next.timeline.trimRanges).toHaveLength(2);
		expect(next.timeline.trimRanges.map((trim) => trim.reason)).toEqual([
			"Remove filler words",
			"Remove filler words",
		]);
		expect(next.timeline.trimRanges.every((trim) => trim.origin === "user")).toBe(true);
		// The picture is untouched: a word cut removes media, it does not move it.
		expect(next.timeline.clips).toEqual(doc.timeline.clips);
	});

	it("covers the whole word, breathing into the silence rather than into the next word", () => {
		const doc = makeDoc([transcript("asset_1", WORDS)]);
		const runs = groupWordCutRuns(planWordCuts(doc, ["w0"]).targets);
		const [trim] = applyWordCutRuns(doc, runs, "Remove filler words", ids()).timeline.trimRanges;

		expect(trim.startSec).toBeLessThanOrEqual(0);
		expect(trim.endSec).toBeGreaterThanOrEqual(0.4);
		// ...and it stops well short of the next spoken word, which must survive.
		expect(trim.endSec).toBeLessThan(1);
	});

	it("does nothing when there is no run to apply", () => {
		const doc = makeDoc([transcript("asset_1", WORDS)]);
		// Identity, not equality: no runs means nothing to save and no undo step to push.
		expect(applyWordCutRuns(doc, [], "Remove filler words", ids())).toBe(doc);
	});

	it("adds to the cuts already there instead of replacing them", () => {
		const doc = makeDoc([transcript("asset_1", WORDS)], {
			trimRanges: [
				{
					id: "trim_old",
					assetId: "asset_1",
					clipId: "clip_1",
					startSec: 40,
					endSec: 41,
					origin: "user",
					reason: "",
				},
			],
		});
		const runs = groupWordCutRuns(planWordCuts(doc, ["w2"]).targets);
		expect(wordCutRunsToTrims(doc, runs, "Remove filler words", ids()).map((t) => t.id)).toEqual([
			"trim_old",
			"trim_new_1",
		]);
	});
});
