// The blend the scene carries on a clip's left edge. Two things have to be true and are pinned
// here: only BLEND kinds emit anything, and the duration is the CLAMPED overlap the programme
// opened — never the authored `durationMs`, or the walk would blend for longer than the two clips
// actually overlap.

import { describe, expect, it } from "vitest";
import type { AxcutClip, AxcutDocument, AxcutTransition } from "@/lib/ai-edition/schema";
import { clipIncomingBlends } from "./clipVideoDips";

const clip = (id: string, startSec: number, endSec: number): AxcutClip =>
	({
		id,
		assetId: `asset_${id}`,
		sourceStartSec: startSec,
		sourceEndSec: endSec,
		timelineStartSec: startSec,
		timelineEndSec: endSec,
		wordRefs: [],
		origin: "user",
		reason: "",
	}) as unknown as AxcutClip;

const doc = (
	transitions?: AxcutTransition[],
	clips: AxcutClip[] = [clip("a", 0, 10), clip("b", 10, 20)],
) =>
	({
		transitions,
		timeline: { clips, trimRanges: [] },
	}) as unknown as AxcutDocument;

const blend = (
	over: Partial<AxcutTransition> & Pick<AxcutTransition, "clipId">,
): AxcutTransition => ({
	id: `t-${over.clipId}`,
	side: "in",
	kind: "dissolve",
	durationMs: 500,
	...over,
});

const visible = [{ id: "a" }, { id: "b" }];

describe("clipIncomingBlends", () => {
	it("puts the overlap on the clip that FOLLOWS the cut", () => {
		const blends = clipIncomingBlends(doc([blend({ clipId: "b" })]), visible);
		expect(blends.size).toBe(1);
		expect(blends.get("b")).toEqual({ kind: "dissolve", durationSec: 0.5 });
		// Nothing on the outgoing clip: a blend is one edge, described once.
		expect(blends.has("a")).toBe(false);
	});

	it("carries the CLAMPED overlap, not the authored duration", () => {
		// 3 s asked for between two 1 s clips. The programme can only overlap by half of the
		// shorter clip, so the blend must run for that half second and no more.
		const short = [clip("a", 0, 1), clip("b", 1, 2)];
		const blends = clipIncomingBlends(doc([blend({ clipId: "b", durationMs: 3000 })], short), [
			{ id: "a" },
			{ id: "b" },
		]);
		expect(blends.get("b")).toEqual({ kind: "dissolve", durationSec: 0.5 });
	});

	it("asks for nothing for a dip", () => {
		// A dip lives inside each clip and costs the programme nothing; `videoDip` carries it.
		const blends = clipIncomingBlends(doc([blend({ clipId: "b", kind: "dip-black" })]), visible);
		expect(blends.size).toBe(0);
	});

	it("ignores `side: out`", () => {
		// The programme's own tail has no incoming clip to blend from.
		expect(clipIncomingBlends(doc([blend({ clipId: "b", side: "out" })]), visible).size).toBe(0);
	});

	it("ignores a blend whose clip is gone", () => {
		expect(clipIncomingBlends(doc([blend({ clipId: "gone" })]), visible).size).toBe(0);
	});

	it("ignores a blend on the FIRST clip", () => {
		// No predecessor to dissolve from; the programme applies no overlap either.
		expect(clipIncomingBlends(doc([blend({ clipId: "a" })]), visible).size).toBe(0);
	});

	it("emits nothing at all when the document has no transitions", () => {
		// The property the whole phase rests on: no blend key on any clip, so the payload and the
		// render of a project written before transitions are what they were.
		expect(clipIncomingBlends(doc([]), visible).size).toBe(0);
		expect(clipIncomingBlends(doc(undefined), visible).size).toBe(0);
	});
});
