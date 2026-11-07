// The frame-grid half of a BLEND: the incoming clip opens `d` programme seconds early, so the
// outgoing clip must give up `d` of its tail. These cases pin the two things that can go wrong —
// trimming a boundary the programme refused, and treating programme seconds as source seconds
// under a speed region.

import { describe, expect, it } from "vitest";
import type { AxcutClip, AxcutDocument, AxcutTransition } from "@/lib/ai-edition/schema";
import { clipBlendTailTrims } from "./clipVideoDips";

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
	legacyEditor: AxcutDocument["legacyEditor"] = null,
) =>
	({
		transitions,
		legacyEditor,
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

const tails = (document: AxcutDocument, clips: AxcutClip[], ends?: number[]) =>
	clipBlendTailTrims(document, clips, ends ?? clips.map((c) => c.sourceEndSec ?? 0));

/** The trim is solved by bisection, so it lands within float noise of the exact second. */
const expectTail = (actual: number[], outgoingSec: number) => {
	expect(actual[0]).toBeCloseTo(outgoingSec, 6);
	expect(actual.slice(1)).toEqual(actual.slice(1).map(() => 0));
};

describe("clipBlendTailTrims", () => {
	it("cuts the overlap off the OUTGOING clip's tail", () => {
		const clips = [clip("a", 0, 10), clip("b", 10, 20)];
		expectTail(tails(doc([blend({ clipId: "b", durationMs: 1000 })], clips), clips), 1);
	});

	it("uses the CLAMPED overlap, not the authored duration", () => {
		// 3 s asked for between two 2 s clips: the programme opens 1 s (half the shorter), so the
		// outgoing loses exactly that second — the same value `clipIncomingBlends` draws with.
		const clips = [clip("a", 0, 2), clip("b", 2, 4)];
		expectTail(tails(doc([blend({ clipId: "b", durationMs: 3000 })], clips), clips), 1);
	});

	it("converts programme seconds to source seconds across a speed region", () => {
		// The outgoing plays at 2×, so one programme second of overlap costs TWO source seconds.
		// Trimming it as one would leave the programme 0.5 s too long and drift the blend window.
		const clips = [clip("a", 0, 10), clip("b", 10, 20)];
		const document = doc([blend({ clipId: "b", durationMs: 1000 })], clips, {
			speedRegions: [{ id: "s", startMs: 0, endMs: 10000, speed: 2 }],
		});
		expectTail(tails(document, clips), 2);
	});

	it("asks for nothing for a dip — it costs the programme nothing", () => {
		const clips = [clip("a", 0, 10), clip("b", 10, 20)];
		const document = doc([blend({ clipId: "b", kind: "dip-black" })], clips);
		expect(tails(document, clips)).toEqual([0, 0]);
	});

	it("ignores the programme's own tail and a blend on the first clip", () => {
		const clips = [clip("a", 0, 10), clip("b", 10, 20)];
		const out = doc([blend({ clipId: "b", side: "out" })], clips);
		expect(tails(out, clips)).toEqual([0, 0]);
		const first = doc([blend({ clipId: "a" })], clips);
		expect(tails(first, clips)).toEqual([0, 0]);
	});

	it("does nothing at all without a blend", () => {
		const clips = [clip("a", 0, 10), clip("b", 10, 20)];
		expect(tails(doc([], clips), clips)).toEqual([0, 0]);
		expect(tails(doc(undefined, clips), clips)).toEqual([0, 0]);
	});

	it("leaves an unprobed outgoing clip alone", () => {
		const clips = [clip("a", 4, 0), clip("b", 10, 20)];
		expect(tails(doc([blend({ clipId: "b" })], clips), clips)).toEqual([0, 0]);
	});
});
