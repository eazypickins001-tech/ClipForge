// Splitting the PICTURE must not damage the sound over it. The measured bug this pins: extract
// audio from a clip, split the clip, and the take was truncated at the cut — the second half of the
// recording played with no audio under it at all, because a split clip is muted and no fragment
// covered the tail any more.

import { describe, expect, it } from "vitest";
import type { AxcutAudioTrack } from "../schema";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { collapseTracksToPills, splitAnchoredAudioAtCut, trackGroupId } from "./audioTracks";
import { detachAudio, splitClip } from "./timeline";

// Ten seconds of one asset, matching what the app writes for a freshly imported recording.
function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_split_audio",
			title: "Split audio",
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

const byStart = (tracks: AxcutAudioTrack[]) => [...tracks].sort((a, b) => a.startMs - b.startMs);

describe("splitClip and the audio over the cut", () => {
	it("keeps an extracted take whole: one pill, both halves still playing", () => {
		const split = splitClip(detachAudio(makeDoc(), "clip_1", "Take"), "clip_1", 4);

		// The lane draws a pill per `trackId`, so one id here IS "the take was not split".
		const pills = collapseTracksToPills(split.audioTracks);
		expect(pills).toHaveLength(1);
		// And it still covers the whole recording — nothing was dropped at the cut.
		expect(pills[0].startMs).toBe(0);
		expect(pills[0].endMs).toBe(10_000);

		// Internally it is one fragment per half, so the file runs ON across the cut rather than
		// restarting: the first half plays 0–4s and the second picks up at 4s.
		const fragments = byStart(split.audioTracks);
		expect(fragments).toHaveLength(2);
		expect(new Set(fragments.map(trackGroupId)).size).toBe(1);
		expect(fragments.map((t) => [t.sourceStartSec, t.sourceEndSec])).toEqual([
			[0, 4],
			[4, 10],
		]);
		expect(fragments.map((t) => [t.startMs, t.endMs])).toEqual([
			[0, 4_000],
			[4_000, 10_000],
		]);
		expect(fragments.map((t) => t.offsetMs)).toEqual([0, 4_000]);
		// Each fragment sits on the clip that owns its footage, so the region clamp keeps both.
		const [left, right] = split.timeline.clips;
		expect(fragments[0].clipId).toBe(left.id);
		expect(fragments[1].clipId).toBe(right.id);
	});

	it("keeps the take's fades on its outer edges, not on the cut", () => {
		const extracted = detachAudio(makeDoc(), "clip_1", "Take");
		const faded: AxcutDocument = {
			...extracted,
			audioTracks: extracted.audioTracks.map((track) => ({
				...track,
				fadeInMs: 300,
				fadeOutMs: 700,
			})),
		};
		const fragments = byStart(splitClip(faded, "clip_1", 4).audioTracks);

		expect(fragments[0].fadeInMs).toBe(300);
		// The head fragment must not fade out at the cut, or the take would dip in the middle.
		expect(fragments[0].fadeOutMs).toBe(0);
		expect(fragments[1].fadeInMs).toBe(0);
		expect(fragments[1].fadeOutMs).toBe(700);
	});

	it("leaves a take that does not reach across the cut untouched", () => {
		const extracted = detachAudio(makeDoc(), "clip_1", "Take");
		// A take that stops at 3s has nothing on the far side of a cut at 4s.
		const short: AxcutDocument = {
			...extracted,
			audioTracks: extracted.audioTracks.map((track) => ({ ...track, sourceEndSec: 3 })),
		};
		const split = splitClip(short, "clip_1", 4);
		expect(split.audioTracks).toHaveLength(1);
		expect(split.audioTracks[0].clipId).toBe("clip_1");
	});

	it("does not touch a take anchored to a different clip", () => {
		const doc = splitClip(makeDoc(), "clip_1", 4);
		// A take anchored to the RIGHT half is not over the cut at all.
		const withTake: AxcutDocument = {
			...doc,
			audioTracks: [
				{
					id: "audio_take",
					trackId: "audio_take",
					assetId: "asset_1",
					kind: "extracted",
					startMs: 4_000,
					endMs: 10_000,
					clipId: doc.timeline.clips[1].id,
					sourceStartSec: 4,
					sourceEndSec: 10,
					offsetMs: 4_000,
					durationSec: 10,
					gainDb: 0,
					loop: false,
					fadeInMs: 0,
					fadeOutMs: 0,
					muted: false,
					label: "Take",
					origin: "user",
				},
			],
		};
		// Splitting the left half again (no-op at this end) must leave that take exactly as it was.
		expect(splitClip(withTake, "clip_1", 2).audioTracks).toEqual(withTake.audioTracks);
	});

	it("returns the same array when no take crosses the cut", () => {
		// The guarantee lives in the helper (`withClipsChanged` always rebuilds the list): a split
		// with no audio over it must not allocate a new tracks array on its way through.
		const none: AxcutAudioTrack[] = [];
		expect(splitAnchoredAudioAtCut(none, "clip_1", "clip_2", 4, () => "new")).toBe(none);

		const extracted = detachAudio(makeDoc(), "clip_1", "Take");
		const short: AxcutAudioTrack[] = extracted.audioTracks.map((track) => ({
			...track,
			sourceEndSec: 3,
		}));
		expect(splitAnchoredAudioAtCut(short, "clip_1", "clip_2", 4, () => "new")).toBe(short);
	});
});
