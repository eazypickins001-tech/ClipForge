import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion, clipSchema } from "../schema";
import { splitClip } from "./timeline";

// A minimal one-clip document: ten seconds of one asset, laid end to end, matching what the
// app writes for a freshly imported recording.
function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_split",
			title: "Split",
			createdAt: "2026-11-02T00:00:00Z",
			updatedAt: "2026-11-02T00:00:00Z",
			primaryAssetId: "asset_1",
		},
		assets: [
			{
				id: "asset_1",
				kind: "video",
				label: "clip.mp4",
				originalPath: "/tmp/clip.mp4",
				durationSec: 10,
				video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
				cameraTrack: null,
			},
		],
		transcript: null,
		transcripts: [],
		timeline: {
			clips: [
				{
					id: "clip_1",
					assetId: "asset_1",
					sourceStartSec: 0,
					sourceEndSec: 10,
					timelineStartSec: 0,
					timelineEndSec: 10,
					wordRefs: [],
					origin: "user",
					reason: "Auto-created full-duration clip",
				},
			],
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
	} as AxcutDocument;
}

describe("splitClip", () => {
	it("cuts one clip into two contiguous halves at the source timecode", () => {
		const doc = splitClip(makeDoc(), "clip_1", 4);

		expect(doc.timeline.clips).toHaveLength(2);
		const [left, right] = doc.timeline.clips;
		// The left half keeps the clip the user selected, so its anchored pills stay attached.
		expect(left.id).toBe("clip_1");
		expect(left.sourceStartSec).toBe(0);
		expect(left.sourceEndSec).toBe(4);
		expect(left.timelineStartSec).toBe(0);
		expect(left.timelineEndSec).toBe(4);

		expect(right.id).not.toBe("clip_1");
		expect(right.sourceStartSec).toBe(4);
		expect(right.sourceEndSec).toBe(10);
		expect(right.timelineStartSec).toBe(4);
		expect(right.timelineEndSec).toBe(10);
	});

	it("marks the new half so joinContiguous cannot fold the cut straight back", () => {
		// `withClipsChanged` ran inside splitClip, so two clips surviving it is already the
		// proof the join did not fire. The flag is what makes that true, so pin it: without it
		// the halves are media-contiguous and same-crop, and they merge back into one.
		const [left, right] = splitClip(makeDoc(), "clip_1", 4).timeline.clips;
		expect(left.detached).toBeFalsy();
		expect(right.detached).toBe(true);
	});

	it("keeps the document's total duration", () => {
		const doc = splitClip(makeDoc(), "clip_1", 4);
		const end = Math.max(...doc.timeline.clips.map((clip) => clip.timelineEndSec));
		expect(end).toBe(10);
	});

	it("round-trips through the schema with the flag intact", () => {
		const doc = splitClip(makeDoc(), "clip_1", 4);
		const parsed = doc.timeline.clips.map((clip) => clipSchema.parse(clip));
		expect(parsed[1].detached).toBe(true);
		expect(parsed[0].sourceEndSec).toBe(4);
	});

	it.each([
		["at the start", 0],
		["at the end", 10],
		["before the clip", -3],
		["after the clip", 14],
		["a sliver from the start", 0.01],
		["a sliver from the end", 9.99],
	])("is a no-op %s", (_label, at) => {
		const doc = makeDoc();
		// Identity, not just equality: a miss must not create a document update (and therefore
		// an undo step) at all.
		expect(splitClip(doc, "clip_1", at)).toBe(doc);
	});

	it("throws on an unknown clip rather than silently doing nothing", () => {
		expect(() => splitClip(makeDoc(), "clip_missing", 4)).toThrow(/Unknown clip clip_missing/);
	});

	it("splits the second clip of a two-clip timeline without disturbing the first", () => {
		const doc = makeDoc();
		doc.timeline.clips.push({
			id: "clip_2",
			assetId: "asset_1",
			sourceStartSec: 10,
			sourceEndSec: 20,
			timelineStartSec: 10,
			timelineEndSec: 20,
			wordRefs: [],
			origin: "user",
			reason: "",
			detached: true,
		});
		doc.assets[0].durationSec = 20;

		const after = splitClip(doc, "clip_2", 15);
		expect(after.timeline.clips.map((clip) => clip.id)).toEqual([
			"clip_1",
			"clip_2",
			expect.any(String),
		]);
		expect(after.timeline.clips[0]).toEqual(doc.timeline.clips[0]);
		expect(after.timeline.clips[1].sourceEndSec).toBe(15);
		expect(after.timeline.clips[2].sourceStartSec).toBe(15);
	});
});
