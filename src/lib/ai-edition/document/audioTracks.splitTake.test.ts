// The audio lane's own razor (`splitAudioTake`), and the flag that makes its cut stick.
//
// The interesting property is not the two pieces, it is that they STAY two pieces: a take's halves
// meet on the ruler and the file runs on across the seam, which is precisely the shape the
// re-anchor walk folds back into one take (it wants to, for the take an inserted word split in
// two). So the cut has to survive an unrelated clip edit, and that is what these tests pin.

import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import {
	collapseTracksToPills,
	removeAudioTrack,
	splitAudioTake,
	trackGroupId,
} from "./audioTracks";
import { detachAudio, splitClip } from "./timeline";

function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_audio_razor",
			title: "Audio razor",
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

/** One extracted take over the only clip, with a `trackId` the tests can refer to. */
function extractedDoc(): { doc: AxcutDocument; trackId: string } {
	const doc = detachAudio(makeDoc(), "clip_1", "Take");
	return { doc, trackId: trackGroupId(doc.audioTracks[0]) };
}

const ids = () => {
	let n = 0;
	return () => `audio_new_${++n}`;
};

const pills = (doc: AxcutDocument) =>
	collapseTracksToPills(doc.audioTracks).sort((a, b) => a.startMs - b.startMs);

describe("splitAudioTake", () => {
	it("cuts one take into two pills at the ruler position", () => {
		const { doc, trackId } = extractedDoc();
		const cut = splitAudioTake(doc, trackId, 4, ids());

		const [head, tail] = pills(cut);
		expect(pills(cut)).toHaveLength(2);
		expect(head.startMs).toBe(0);
		expect(head.endMs).toBe(4_000);
		expect(tail.startMs).toBe(4_000);
		expect(tail.endMs).toBe(10_000);
		// The sound is continuous: the second piece picks the file up at 4s, it does not restart.
		expect(head.offsetMs).toBe(0);
		expect(tail.offsetMs).toBe(4_000);
	});

	it("marks the tail so a later clip edit cannot fold the cut away", () => {
		const { doc, trackId } = extractedDoc();
		const cut = splitAudioTake(doc, trackId, 4, ids());
		// An unrelated picture edit runs the re-anchor walk, which rejoins takes that meet and run
		// on. The mark is the only thing standing between the user's cut and that rejoin.
		const afterClipEdit = splitClip(cut, "clip_1", 2);
		expect(pills(afterClipEdit)).toHaveLength(2);
		expect(pills(afterClipEdit)[1].startMs).toBe(4_000);
	});

	it("keeps each piece's fades on its own outer edge", () => {
		const { doc, trackId } = extractedDoc();
		const faded: AxcutDocument = {
			...doc,
			audioTracks: doc.audioTracks.map((t) => ({ ...t, fadeInMs: 250, fadeOutMs: 500 })),
		};
		const [head, tail] = pills(splitAudioTake(faded, trackId, 4, ids()));
		expect(head.fadeInMs).toBe(250);
		expect(head.fadeOutMs).toBe(0);
		expect(tail.fadeInMs).toBe(0);
		expect(tail.fadeOutMs).toBe(500);
	});

	it("leaves the two pieces independently deletable", () => {
		const { doc, trackId } = extractedDoc();
		const cut = splitAudioTake(doc, trackId, 4, ids());
		const withoutTail = removeAudioTrack(cut, pills(cut)[1].id);
		expect(pills(withoutTail)).toHaveLength(1);
		expect(pills(withoutTail)[0].endMs).toBe(4_000);
	});

	it("cuts a take that spans two clips at the seam between them", () => {
		// Extracted audio over a clip, then the PICTURE split: the take stays whole (Part 1), so it
		// now has one fragment per half — and a razor on the seam must still part it.
		const { doc, trackId } = extractedDoc();
		const videoSplit = splitClip(doc, "clip_1", 4);
		expect(pills(videoSplit)).toHaveLength(1);

		const cut = splitAudioTake(videoSplit, trackId, 4, ids());
		const [head, tail] = pills(cut);
		expect(pills(cut)).toHaveLength(2);
		expect([head.startMs, head.endMs]).toEqual([0, 4_000]);
		expect([tail.startMs, tail.endMs]).toEqual([4_000, 10_000]);
		expect(tail.offsetMs).toBe(4_000);
	});

	it.each([
		["on the head edge", 0],
		["on the tail edge", 10],
		["before the take", -2],
		["after the take", 12],
		["a sliver off the head", 0.01],
		["a sliver off the tail", 9.99],
	])("is a no-op %s", (_label, at) => {
		const { doc, trackId } = extractedDoc();
		// Identity, not equality: a miss must not write, and so must not push an undo step.
		expect(splitAudioTake(doc, trackId, at, ids())).toBe(doc);
	});

	it("is a no-op for a track that is not there", () => {
		const { doc } = extractedDoc();
		expect(splitAudioTake(doc, "audio_missing", 4, ids())).toBe(doc);
	});
});
