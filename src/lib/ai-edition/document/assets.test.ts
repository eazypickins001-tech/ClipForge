import { describe, expect, it } from "vitest";
import { type AxcutDocument, axcutSchemaVersion } from "../schema";
import { relinkAsset } from "./assets";

function makeDoc(): AxcutDocument {
	return {
		schemaVersion: axcutSchemaVersion,
		project: {
			id: "proj_relink",
			title: "Relink",
			createdAt: "2026-11-03T00:00:00Z",
			updatedAt: "2026-11-03T00:00:00Z",
			primaryAssetId: "asset_1",
		},
		assets: [
			{
				id: "asset_1",
				kind: "video",
				label: "China marekt1.mp4",
				originalPath: "C:\\Users\\Apple\\Downloads\\China marekt1.mp4",
				durationSec: 30,
				video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
				cameraTrack: null,
			},
			{
				id: "asset_2",
				kind: "video",
				label: "other.mp4",
				originalPath: "C:\\other.mp4",
				durationSec: 10,
				video: { codec: "h264", width: 1280, height: 720, fps: 30 },
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
					sourceStartSec: 2,
					sourceEndSec: 12,
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

describe("relinkAsset", () => {
	it("moves the path and nothing else, so the edit survives", () => {
		const before = makeDoc();
		const after = relinkAsset(before, "asset_1", "D:\\moved\\China marekt1.mp4");

		const asset = after.assets.find((candidate) => candidate.id === "asset_1");
		expect(asset?.originalPath).toBe("D:\\moved\\China marekt1.mp4");
		// Relinking must not look like a re-import: id, label and the whole timeline stay put.
		expect(asset?.id).toBe("asset_1");
		expect(asset?.label).toBe("China marekt1.mp4");
		expect(after.timeline).toBe(before.timeline);
		expect(after.timeline.clips).toHaveLength(1);
		expect(after.timeline.clips[0].sourceStartSec).toBe(2);
	});

	it("leaves the other assets alone", () => {
		const after = relinkAsset(makeDoc(), "asset_1", "D:\\moved\\China marekt1.mp4");
		expect(after.assets.find((a) => a.id === "asset_2")?.originalPath).toBe("C:\\other.mp4");
	});

	it("is a no-op for an unknown asset", () => {
		const before = makeDoc();
		expect(relinkAsset(before, "asset_missing", "D:\\x.mp4")).toBe(before);
	});

	it("is a no-op when the path is already the one in use", () => {
		// Identity, not just equality: the store skips saving on identity, so a relink to the same
		// file must not push an undo step the user cannot see.
		const before = makeDoc();
		expect(relinkAsset(before, "asset_1", "C:\\Users\\Apple\\Downloads\\China marekt1.mp4")).toBe(
			before,
		);
	});
});
