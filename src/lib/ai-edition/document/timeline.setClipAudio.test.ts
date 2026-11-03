import { describe, expect, it } from "vitest";
import { type AxcutClip, type AxcutDocument, axcutSchemaVersion } from "../schema";
import { setClipAudio } from "./timeline";

function clip(id: string, sourceStartSec: number, sourceEndSec: number): AxcutClip {
	return {
		id,
		assetId: "asset_1",
		sourceStartSec,
		sourceEndSec,
		timelineStartSec: sourceStartSec,
		timelineEndSec: sourceEndSec,
		wordRefs: [],
		origin: "user",
		reason: "",
	} as AxcutClip;
}

/** Two media-contiguous clips of one asset: `joinContiguous` folds this pair into one clip
 *  whenever their content guards agree, which is exactly what the audio fields now join. */
function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_clip_audio",
			title: "Clip audio",
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
			clips: [clip("clip_a", 0, 5), clip("clip_b", 5, 10)],
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

describe("setClipAudio", () => {
	it("writes the fields on the clip it was given and leaves the other clip alone", () => {
		const doc = makeDoc();
		const next = setClipAudio(doc, "clip_a", { gainDb: -6, muted: true, fadeInMs: 250 });

		const [a, b] = next.timeline.clips;
		expect(a.id).toBe("clip_a");
		expect(a.gainDb).toBe(-6);
		expect(a.muted).toBe(true);
		expect(a.fadeInMs).toBe(250);
		// No audio field leaked onto the clip that was not asked for. (`withClipsChanged`
		// resequences the list, so this is a value comparison, not an identity one.)
		expect(b).toEqual(doc.timeline.clips[1]);
	});

	it("keeps an audio difference from being folded away by the next edit", () => {
		// The pair is media-contiguous, same asset, same crop: the only thing telling them apart
		// is the audio. `joinable` has to compare it, or muting one half would fold both halves
		// into a single clip and the mute would take the other half's sound with it.
		const doc = makeDoc();

		expect(setClipAudio(doc, "clip_a", { muted: true }).timeline.clips).toHaveLength(2);
		expect(setClipAudio(doc, "clip_a", { gainDb: -6 }).timeline.clips).toHaveLength(2);
		expect(setClipAudio(doc, "clip_a", { fadeInMs: 500 }).timeline.clips).toHaveLength(2);
		expect(setClipAudio(doc, "clip_a", { fadeOutMs: 500 }).timeline.clips).toHaveLength(2);
	});

	it("still folds the pair when their audio agrees, which is what makes the guard the reason", () => {
		// The control for the test above: with nothing to tell the halves apart they are one clip
		// again, so a pass that keeps two clips is keeping them apart because of the audio.
		const fused = setClipAudio(makeDoc(), "clip_a", {});
		expect(fused.timeline.clips).toHaveLength(1);
		expect(fused.timeline.clips[0].sourceStartSec).toBe(0);
		expect(fused.timeline.clips[0].sourceEndSec).toBe(10);
	});

	it("writes nothing for an unknown id", () => {
		const doc = makeDoc();
		const next = setClipAudio(doc, "clip_missing", { muted: true });

		// No clip gained an audio field. The list itself is not preserved: it still goes through
		// `withClipsChanged`, which folds this contiguous, audio-identical pair back into one clip —
		// what any clip edit in this module does, and not something this op decides.
		expect(next.timeline.clips.every((clip) => clip.muted === undefined)).toBe(true);
		expect(next.timeline.clips.every((clip) => clip.gainDb === undefined)).toBe(true);
	});
});
