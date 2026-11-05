// The capture rule shared by the inspector's "Add keyframe" and the zoom pill's own button. Both
// ask this, so the interesting cases are the edges: outside the region, and capturing twice.

import { describe, expect, it } from "vitest";
import type { AxcutZoomRegion } from "../schema";
import { addFocusKeyframe, keyframeAtFor } from "./zoomKeyframes";

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

describe("addFocusKeyframe", () => {
	it("captures the region's current focus at the playhead", () => {
		expect(addFocusKeyframe(region(), 4)).toEqual([{ at: 0.5, cx: 0.25, cy: 0.75 }]);
	});

	it("keeps the path sorted by position", () => {
		const withOne = region({ keyframes: [{ at: 0.9, cx: 0.5, cy: 0.5 }] });
		expect(addFocusKeyframe(withOne, 2)?.map((key) => key.at)).toEqual([0, 0.9]);
	});

	it("replaces a key captured at the same instant instead of stacking a duplicate", () => {
		// Two captures a hair apart are one key — otherwise a double click leaves a twin to hunt.
		// The survivor sits at the NEW capture: the last capture wins, timing included.
		const withOne = region({ keyframes: [{ at: 0.5, cx: 0.1, cy: 0.1 }] });
		const next = addFocusKeyframe(withOne, 4.001);
		expect(next).toHaveLength(1);
		expect(next?.[0]?.at).toBeCloseTo(0.5, 3);
		expect(next?.[0]).toMatchObject({ cx: 0.25, cy: 0.75 });
	});

	it("is null when the playhead is outside the region", () => {
		expect(addFocusKeyframe(region(), 0)).toBeNull();
		expect(addFocusKeyframe(region(), 9)).toBeNull();
	});
});
