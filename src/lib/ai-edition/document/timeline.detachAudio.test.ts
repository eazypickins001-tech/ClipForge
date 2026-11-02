import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { detachAudio } from "./timeline";

// Ten seconds of one asset, laid end to end — what the app writes for a fresh import.
function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_audio",
			title: "Audio",
			createdAt: "2026-11-02T00:00:00Z",
			updatedAt: "2026-11-02T00:00:00Z",
			primaryAssetId: "asset_1",
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
					reason: "",
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

describe("detachAudio", () => {
	it("moves the clip's audio onto its own track, anchored to the clip's source range", () => {
		const doc = detachAudio(makeDoc(), "clip_1", "take.mp4");

		expect(doc.audioTracks).toHaveLength(1);
		const [track] = doc.audioTracks;
		expect(track.assetId).toBe("asset_1");
		expect(track.clipId).toBe("clip_1");
		expect(track.sourceStartSec).toBe(0);
		expect(track.sourceEndSec).toBe(10);
		// CapCut names the extracted track after the video, and so does the caller here.
		expect(track.label).toBe("take.mp4");
		// Unity gain: this is the recording's own voice, not a music bed.
		expect(track.gainDb).toBe(0);
	});

	it("silences the clip over its span so nothing plays twice", () => {
		const doc = detachAudio(makeDoc(), "clip_1", "take.mp4");

		expect(doc.timeline.muteRanges).toEqual([
			{ startSec: 0, endSec: 10, reason: "Audio extracted" },
		]);
	});

	it("leaves the clip in place — extraction is not a delete", () => {
		const doc = detachAudio(makeDoc(), "clip_1", "take.mp4");
		expect(doc.timeline.clips).toHaveLength(1);
		expect(doc.timeline.clips[0]).toEqual(makeDoc().timeline.clips[0]);
	});

	it("carries the source offset when the clip was trimmed, so the track stays in sync", () => {
		// A clip that starts 3s into its file. Without offsetMs the extracted track would replay
		// the first three seconds and drift against the picture.
		const doc = makeDoc();
		doc.timeline.clips[0] = {
			...doc.timeline.clips[0],
			sourceStartSec: 3,
			sourceEndSec: 8,
			timelineStartSec: 0,
			timelineEndSec: 5,
		};

		const [track] = detachAudio(doc, "clip_1", "take.mp4").audioTracks;
		expect(track.offsetMs).toBe(3000);
		expect(track.sourceStartSec).toBe(3);
		expect(track.sourceEndSec).toBe(8);
		expect(track.startMs).toBe(0);
		expect(track.endMs).toBe(5000);
	});

	it("does not stack a second mute over a span that is already silent", () => {
		const doc = makeDoc();
		doc.timeline.muteRanges = [{ startSec: 0, endSec: 10, reason: "already" }];

		expect(detachAudio(doc, "clip_1", "take.mp4").timeline.muteRanges).toHaveLength(1);
	});

	it("is a no-op for an unknown clip, returning the same document", () => {
		const doc = makeDoc();
		expect(detachAudio(doc, "clip_missing", "x")).toBe(doc);
	});
});
