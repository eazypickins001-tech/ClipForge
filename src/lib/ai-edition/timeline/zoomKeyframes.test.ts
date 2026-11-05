// The capture rule shared by the inspector's "Add keyframe" and the zoom pill's own button. Both
// ask this, so the interesting cases are the edges: outside the region, capturing twice, and which
// zoom level a key records — the level the picture shows, not the one the document happens to store.

import { describe, expect, it } from "vitest";
import type { AxcutZoomRegion } from "../schema";
import { addZoomKeyframe, keyframeAtFor } from "./zoomKeyframes";

/** A 4 s zoom (2 s → 6 s on the ruler) whose focus sits off-centre, so a captured key is
 *  distinguishable from the default centre. */
function region(over: Partial<AxcutZoomRegion> = {}): AxcutZoomRegion {
	return {
		id: "z",
		startMs: 2000,
		endMs: 6000,
		depth: 2,
		focus: { cx: 0.25, cy: 0.75 },
		...over,
	} as AxcutZoomRegion;
}

describe("keyframeAtFor", () => {
	it("maps a position inside the region onto 0..1", () => {
		expect(keyframeAtFor(region(), 2)).toBe(0);
		expect(keyframeAtFor(region(), 4)).toBe(0.5);
		expect(keyframeAtFor(region(), 6)).toBe(1);
	});

	it("is null outside the region", () => {
		expect(keyframeAtFor(region(), 1.9)).toBeNull();
		expect(keyframeAtFor(region(), 6.1)).toBeNull();
	});
});

describe("addZoomKeyframe", () => {
	it("captures the region's current focus AND level at the playhead", () => {
		// A key carries the zoom it was captured at, so a region can push in or pull out between
		// keys instead of holding one depth. Depth 2 renders at 1.5×.
		expect(addZoomKeyframe(region(), 4)).toEqual([{ at: 0.5, cx: 0.25, cy: 0.75, scale: 1.5 }]);
	});

	it("records the level the picture shows, not the raw customScale", () => {
		// `customScale: 12` is a legal document — the schema only requires it to be positive — and it
		// renders at MAX_ZOOM_SCALE. A key must carry that, or the path would hold a level the
		// compositor clamps away and the animation would not be the one the user captured.
		expect(addZoomKeyframe(region({ customScale: 12 }), 4)?.[0]).toMatchObject({ scale: 5 });
		expect(addZoomKeyframe(region({ depth: 5 }), 4)?.[0]).toMatchObject({ scale: 3.5 });
		// A NaN scale is not a number the renderer can use, so the depth answers instead.
		expect(addZoomKeyframe(region({ customScale: Number.NaN }), 4)?.[0]).toMatchObject({
			scale: 1.5,
		});
	});

	it("keeps the path sorted by position", () => {
		const withOne = region({ keyframes: [{ at: 0.9, cx: 0.5, cy: 0.5 }] });
		expect(addZoomKeyframe(withOne, 2)?.map((key) => key.at)).toEqual([0, 0.9]);
	});

	it("replaces a key captured at the same instant instead of stacking a duplicate", () => {
		// Two captures a hair apart are one key — otherwise a double click leaves a twin to hunt.
		// The survivor sits at the NEW capture: the last capture wins, timing included.
		const withOne = region({ keyframes: [{ at: 0.5, cx: 0.1, cy: 0.1 }] });
		const next = addZoomKeyframe(withOne, 4.001);
		expect(next).toHaveLength(1);
		expect(next?.[0]?.at).toBeCloseTo(0.5, 3);
		expect(next?.[0]).toMatchObject({ cx: 0.25, cy: 0.75 });
	});

	it("is null when the playhead is outside the region", () => {
		expect(addZoomKeyframe(region(), 0)).toBeNull();
		expect(addZoomKeyframe(region(), 9)).toBeNull();
	});
});
