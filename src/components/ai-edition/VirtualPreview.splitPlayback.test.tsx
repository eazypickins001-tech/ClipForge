// @vitest-environment jsdom
// Reproduces the reported bug: after splitting a clip, pressing Play with the playhead on the
// cut leaves the playhead stuck. Driven by hand, one rAF frame at a time, like
// VirtualPreview.playback.test.tsx.
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxcutClip } from "@/lib/ai-edition/schema";
import { type VideoSource, VirtualPreview } from "./VirtualPreview";

let frameCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
	frameCallbacks = [];
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		frameCallbacks.push(cb);
		return frameCallbacks.length;
	});
	vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function tick() {
	const pending = frameCallbacks;
	frameCallbacks = [];
	act(() => {
		for (const cb of pending) cb(0);
	});
}

function clip(
	id: string,
	assetId: string,
	sourceStartSec: number,
	sourceEndSec: number,
	timelineStartSec: number,
): AxcutClip {
	return {
		id,
		assetId,
		sourceStartSec,
		sourceEndSec,
		timelineStartSec,
		timelineEndSec: timelineStartSec + (sourceEndSec - sourceStartSec),
		wordRefs: [],
		origin: "user",
		reason: "",
	};
}

function driveVideo(element: HTMLVideoElement) {
	let currentTime = 0;
	let paused = true;
	const pauseCalls: number[] = [];
	Object.defineProperty(element, "currentTime", {
		configurable: true,
		get: () => currentTime,
		set: (next: number) => {
			currentTime = next;
		},
	});
	Object.defineProperty(element, "paused", { configurable: true, get: () => paused });
	Object.defineProperty(element, "readyState", { configurable: true, get: () => 4 });
	Object.defineProperty(element, "duration", { configurable: true, get: () => 20 });
	element.play = vi.fn(() => {
		paused = false;
		return Promise.resolve();
	});
	element.pause = vi.fn(() => {
		paused = true;
		pauseCalls.push(currentTime);
	});
	return {
		pauseCalls,
		seekTo: (next: number) => {
			currentTime = next;
		},
		play: () => {
			paused = false;
		},
		get currentTime() {
			return currentTime;
		},
	};
}

function mount(clips: AxcutClip[]) {
	const onTimeChange = vi.fn();
	const sources: VideoSource[] = [{ id: "a1", src: "file:///tmp/a1.mp4", label: "a1" }];
	const { container } = render(
		<VirtualPreview videoSources={sources} clips={clips} onTimeChange={onTimeChange} />,
	);
	const element = container.querySelector("video");
	if (!element) throw new Error("no <video>");
	const video = driveVideo(element as HTMLVideoElement);
	act(() => {
		fireEvent.loadedMetadata(element);
	});
	return { onTimeChange, video, element: element as HTMLVideoElement };
}

const reported = (onTimeChange: ReturnType<typeof vi.fn>) =>
	onTimeChange.mock.calls.map((call) => call[0] as number);

describe("playback right after a split", () => {
	it("advances past the cut instead of sticking on it", () => {
		// One 20 s recording split at 10 s: two contiguous halves of the same asset.
		const clips = [clip("left", "a1", 0, 10, 0), clip("right", "a1", 10, 20, 10)];
		const { onTimeChange, video, element } = mount(clips);

		// The playhead is ON the cut, which is where a split leaves it, and the decoder is there.
		video.seekTo(10);
		tick();

		// Press Play: the element starts, and the cut is where playback begins.
		act(() => {
			video.play();
			fireEvent.play(element);
		});
		tick();
		// Let a few real frames of playback go by.
		for (const t of [10.04, 10.1, 10.2]) {
			video.seekTo(t);
			tick();
		}

		expect(video.pauseCalls).toHaveLength(0);
		expect(reported(onTimeChange).at(-1)).toBeGreaterThan(10.1);
	});

	it("does not rewind onto the cut when the left half still claims the boundary", () => {
		// The real state after a split: the playhead sat just before the cut, so the LEFT clip
		// is the one the tick is tracking. Its closing edge is inclusive for 50 ms, so the very
		// frames past the cut still resolve to it — and each one reads as "clip ended", rewinds
		// to the cut, and the playhead never leaves 10 s. That is the reported "play does
		// nothing until I nudge the playhead forward".
		const clips = [clip("left", "a1", 0, 10, 0), clip("right", "a1", 10, 20, 10)];
		const { onTimeChange, video, element } = mount(clips);

		// Track the LEFT clip: play it up to just before the cut while it is the active clip.
		video.seekTo(9.9);
		tick();
		act(() => {
			video.play();
			fireEvent.play(element);
		});
		tick();
		// Now the media crosses the cut, frame by frame — as a decoder would.
		for (const t of [10.0, 10.04, 10.1, 10.2, 10.3]) {
			video.seekTo(t);
			tick();
		}

		// It must have kept the media moving forward instead of dragging it back to 10 each frame.
		expect(video.currentTime).toBeGreaterThan(10.1);
		expect(video.pauseCalls).toHaveLength(0);
		expect(reported(onTimeChange).at(-1)).toBeGreaterThan(10.1);
	});
});

describe("playback through three contiguous halves", () => {
	it("does not pin the playhead to a middle cut", () => {
		// Splitting three times leaves three contiguous halves; the middle one must not
		// pin the playhead to its own start.
		const clips = [
			clip("a", "a1", 0, 5, 0),
			clip("b", "a1", 5, 10, 5),
			clip("c", "a1", 10, 20, 10),
		];
		const { onTimeChange, video, element } = mount(clips);

		video.seekTo(4.9);
		tick();
		act(() => {
			video.play();
			fireEvent.play(element);
		});
		for (const t of [5.0, 5.04, 5.2, 6]) {
			video.seekTo(t);
			tick();
		}
		expect(video.pauseCalls).toHaveLength(0);
		expect(video.currentTime).toBeGreaterThan(5.2);
		expect(reported(onTimeChange).at(-1)).toBeGreaterThan(5.2);
	});
});
