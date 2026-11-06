// The reframe arithmetic: which window over the source matches a target format, and where to look.
//
// These are the decisions that decide whether "reframe for vertical" cuts the subject off or frames
// it, so they are pinned here rather than discovered on a render.

import { describe, expect, it } from "vitest";
import type { AxcutClip, AxcutDocument } from "../schema";
import { authoredCentreFor, parseAspectRatioToken, reframeCrop } from "./reframe";

const centre = { cx: 0.5, cy: 0.5 };

describe("parseAspectRatioToken", () => {
	it("reads both orders as width/height", () => {
		expect(parseAspectRatioToken("16:9")).toBeCloseTo(16 / 9, 6);
		expect(parseAspectRatioToken("9:16")).toBeCloseTo(9 / 16, 6);
		expect(parseAspectRatioToken("1:1")).toBe(1);
		expect(parseAspectRatioToken("4:5")).toBeCloseTo(0.8, 6);
		expect(parseAspectRatioToken(" 1 : 1 ")).toBe(1);
	});

	it("refuses anything it cannot read, including `auto`", () => {
		// `auto` follows the first clip, so it has no fixed ratio to crop to. Refusing it is the
		// point: a caller must not crop to a ratio this function invented.
		for (const token of ["auto", "", "16x9", "16:", ":9", "0:9", "16:0", "wide"]) {
			expect(parseAspectRatioToken(token)).toBeNull();
		}
	});
});

describe("reframeCrop", () => {
	const source = { sourceWidth: 1920, sourceHeight: 1080 };

	it("keeps the whole frame when the target is the source's shape", () => {
		expect(reframeCrop({ ...source, target: { width: 16, height: 9 }, centre })).toEqual({
			x: 0,
			y: 0,
			width: 1,
			height: 1,
		});
	});

	it("trims WIDTH for a taller target and keeps full height", () => {
		// 16:9 → 9:16: a 9/16-wide window, full height, so nothing the source lacks is invented.
		const crop = reframeCrop({ ...source, target: { width: 9, height: 16 }, centre });
		expect(crop?.height).toBe(1);
		expect(crop?.width).toBeCloseTo(9 / 16 / (16 / 9), 6);
		// Centred: the window straddles the middle.
		expect(crop?.x).toBeCloseTo((1 - (crop?.width ?? 0)) / 2, 6);
		expect(crop?.y).toBe(0);
	});

	it("trims HEIGHT for a wider target", () => {
		// A 9:16 source in a 16:9 frame: full width kept, height reduced to the ratio between them.
		const crop = reframeCrop({
			sourceWidth: 1080,
			sourceHeight: 1920,
			target: { width: 16, height: 9 },
			centre,
		});
		expect(crop?.width).toBe(1);
		expect(crop?.height).toBeCloseTo(1080 / 1920 / (16 / 9), 6);
		// Centred, so the trimmed bands are equal top and bottom.
		expect(crop?.y).toBeCloseTo((1 - (crop?.height ?? 0)) / 2, 6);
		expect(crop?.x).toBe(0);
	});

	it("follows the centre without leaving the source", () => {
		// A subject at the far left, a tall target: the window sits at the left edge and is NOT
		// allowed to hang off the source.
		const crop = reframeCrop({
			...source,
			target: { width: 9, height: 16 },
			centre: { cx: 0.0, cy: 0.5 },
		});
		expect(crop?.x).toBe(0);
		const right = reframeCrop({
			...source,
			target: { width: 9, height: 16 },
			centre: { cx: 1.0, cy: 1.0 },
		});
		expect(right?.x).toBeCloseTo(1 - (right?.width ?? 0), 6);
		expect(right?.y).toBeCloseTo(1 - (right?.height ?? 0), 6);
	});

	it("refuses a source with no probed dimensions", () => {
		// The case a project is in before the probe lands. A crop guessed from 16:9 would be right
		// only by luck, so the caller is told there is nothing to compute.
		expect(
			reframeCrop({ sourceWidth: 0, sourceHeight: 0, target: { width: 9, height: 16 }, centre }),
		).toBeNull();
		expect(reframeCrop({ ...source, target: { width: 0, height: 0 }, centre })).toBeNull();
	});
});

function clip(id: string, startSec: number, endSec: number): AxcutClip {
	return { id, assetId: "a", timelineStartSec: startSec, timelineEndSec: endSec } as AxcutClip;
}

const zoom = (startSec: number, endSec: number, cx: number, cy: number) =>
	({
		id: `z${startSec}`,
		startMs: startSec * 1000,
		endMs: endSec * 1000,
		depth: 3,
		focus: { cx, cy },
	}) as AxcutDocument["zoomRanges"][number];

describe("authoredCentreFor", () => {
	it("is the middle of the frame when nothing was framed", () => {
		const doc = { assets: [], timeline: { clips: [] }, zoomRanges: [] } as unknown as AxcutDocument;
		expect(authoredCentreFor(doc, clip("c", 0, 10))).toEqual({ cx: 0.5, cy: 0.5, from: "centre" });
	});

	it("averages the zooms placed over the clip, and only those", () => {
		const doc = {
			zoomRanges: [
				zoom(2, 4, 0.2, 0.6),
				zoom(6, 8, 0.4, 0.8),
				// Another clip's zoom must not pull the average: a reframe looks at this clip.
				zoom(30, 40, 0.9, 0.9),
			],
			assets: [],
			timeline: { clips: [] },
		} as unknown as AxcutDocument;
		const centreForClip = authoredCentreFor(doc, clip("c", 0, 10));
		expect(centreForClip.cx).toBeCloseTo(0.3, 6);
		expect(centreForClip.cy).toBeCloseTo(0.7, 6);
		expect(centreForClip.from).toBe("authored");
	});

	it("counts a zoom that only overlaps the clip's edge", () => {
		// A zoom straddling the cut is the author looking at something in this clip's window.
		const doc = {
			zoomRanges: [zoom(8, 20, 0.8, 0.2)],
			assets: [],
			timeline: { clips: [] },
		} as unknown as AxcutDocument;
		expect(authoredCentreFor(doc, clip("c", 0, 10)).from).toBe("authored");
	});
});
