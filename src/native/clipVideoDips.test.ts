import { describe, expect, it } from "vitest";
import type { AxcutDocument, AxcutTransition } from "@/lib/ai-edition/schema";
import { clipVideoDips, transitionColor } from "./clipVideoDips";

const clips = [{ id: "a" }, { id: "b" }, { id: "c" }];
const doc = (transitions?: AxcutTransition[]) => ({ transitions }) as unknown as AxcutDocument;
const dip = (
	over: Partial<AxcutTransition> & Pick<AxcutTransition, "clipId">,
): AxcutTransition => ({
	id: `t-${over.clipId}`,
	side: "in",
	kind: "dip-black",
	durationMs: 500,
	...over,
});

describe("clipVideoDips", () => {
	it("puts half the duration on each side of the cut", () => {
		const dips = clipVideoDips(doc([dip({ clipId: "b" })]), clips);
		// The incoming clip ramps UP, its predecessor ramps DOWN. The two halves are what makes a
		// 500 ms dip a 250 ms ramp each way, and they land on different clips.
		expect(dips.get("b")).toMatchObject({ fadeInSec: 0.25, fadeOutSec: 0 });
		expect(dips.get("a")).toMatchObject({ fadeOutSec: 0.25, fadeInSec: 0 });
		// A clip nowhere near the cut is untouched.
		expect(dips.has("c")).toBe(false);
	});

	it("reads a first clip's dip as the programme's fade-in", () => {
		// There is no predecessor to fade out, so only the incoming side exists. This is what a
		// transition at the very start of a project means.
		const dips = clipVideoDips(doc([dip({ clipId: "a" })]), clips);
		expect(dips.get("a")).toMatchObject({ fadeInSec: 0.25, fadeOutSec: 0 });
		expect(dips.size).toBe(1);
	});

	it("honours `out` only on the final clip", () => {
		// The programme's own tail. On the last clip it is the fade-to-black at the end.
		const tail = clipVideoDips(doc([dip({ clipId: "c", side: "out" })]), clips);
		expect(tail.get("c")).toMatchObject({ fadeOutSec: 0.25, fadeInSec: 0 });
		// Anywhere else it would be the next clip's `in` written a second time, so it is ignored —
		// one junction must not be written twice.
		expect(clipVideoDips(doc([dip({ clipId: "b", side: "out" })]), clips).size).toBe(0);
	});

	it("ignores a dip whose clip is gone", () => {
		// A dangling anchor must not resurrect a boundary that no longer exists.
		expect(clipVideoDips(doc([dip({ clipId: "gone" })]), clips).size).toBe(0);
	});

	it("asks for nothing when the document has no transitions", () => {
		// The property the whole phase rests on: a project written before transitions emits no
		// `videoDip` at all, so it renders exactly as it did.
		expect(clipVideoDips(doc([]), clips).size).toBe(0);
		expect(clipVideoDips(doc(undefined), clips).size).toBe(0);
	});

	it("carries the colour a dip passes through", () => {
		expect(transitionColor(dip({ clipId: "b", kind: "dip-white" }))).toBe("#ffffff");
		expect(transitionColor(dip({ clipId: "b", kind: "dip-black" }))).toBe("#000000");
		expect(transitionColor(dip({ clipId: "b", kind: "dip-color", color: "#123456" }))).toBe(
			"#123456",
		);
		// A dip-color with no colour chosen still has to dip through something.
		expect(transitionColor(dip({ clipId: "b", kind: "dip-color" }))).toBe("#000000");
	});
});
