// The shared "which clip does this action mean" rules. Pure arithmetic over the timeline, so it is
// cheap to pin the edges: the half-open spans, the gap, and the programme start (where the
// playhead's own clip has no left edge to put a transition on).

import { describe, expect, it } from "vitest";
import type { AxcutClip } from "@/lib/ai-edition/schema";
import { clipAtPlayhead, transitionTargetClip } from "./clipTargets";

const clip = (id: string, startSec: number, endSec: number) =>
	({ id, timelineStartSec: startSec, timelineEndSec: endSec }) as unknown as AxcutClip;

// Two contiguous clips: A 0–2s, B 2–4s. The one boundary is B's left edge.
const TWO = [clip("A", 0, 2), clip("B", 2, 4)];

describe("clipAtPlayhead", () => {
	it("finds the clip the playhead is inside", () => {
		expect(clipAtPlayhead(TWO, 1)?.id).toBe("A");
		expect(clipAtPlayhead(TWO, 3)?.id).toBe("B");
	});

	it("treats a clip's span as open at both ends", () => {
		// The boundary second belongs to neither clip, so a cut exactly on it has no single target.
		expect(clipAtPlayhead([clip("A", 0, 2)], 0)).toBeNull();
		expect(clipAtPlayhead([clip("A", 0, 2)], 2)).toBeNull();
	});

	it("is null in a gap or past the end", () => {
		expect(clipAtPlayhead([clip("A", 0, 2), clip("B", 3, 5)], 2.5)).toBeNull();
		expect(clipAtPlayhead(TWO, 9)).toBeNull();
		expect(clipAtPlayhead([], 1)).toBeNull();
	});
});

describe("transitionTargetClip", () => {
	it("is null when there is no boundary", () => {
		expect(transitionTargetClip([], 1)).toBeNull();
		expect(transitionTargetClip([clip("A", 0, 2)], 1)).toBeNull();
	});

	it("picks the boundary before the playhead's own clip", () => {
		// Inside B: B's left edge is the cut the user is nearest.
		expect(transitionTargetClip(TWO, 3)?.id).toBe("B");
	});

	it("picks the boundary AFTER the first clip when the playhead is in it", () => {
		// Inside A: A's own left edge is the programme start, so the cut it precedes is meant.
		expect(transitionTargetClip(TWO, 1)?.id).toBe("B");
	});

	it("picks the first boundary after a playhead that is in no clip", () => {
		const three = [clip("A", 0, 2), clip("B", 4, 6), clip("C", 8, 10)];
		// In the gap before B: B's left edge is the next boundary.
		expect(transitionTargetClip(three, 2.5)?.id).toBe("B");
		// Past the end: fall back to the last boundary rather than nothing.
		expect(transitionTargetClip(three, 99)?.id).toBe("C");
	});
});
