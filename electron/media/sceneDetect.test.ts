// The FFmpeg scene pass: argument shape, the `showinfo` parse, the minimum-gap rule, and the
// degradation paths. No real decode here — `spawn` is mocked, exactly as `extractAudio.test.ts`
// does it, so these run on the GPU-less CI box that has no FFmpeg at all.

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFfmpeg } from "./audioPeaks";
import {
	detectScenes,
	filterSceneCuts,
	parseProgressMicros,
	parseSceneCuts,
	sceneDetectArgs,
} from "./sceneDetect";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("./audioPeaks", () => ({ resolveFfmpeg: vi.fn() }));

const spawnMock = vi.mocked(spawn);
const resolveFfmpegMock = vi.mocked(resolveFfmpeg);

interface FakeChild extends EventEmitter {
	stderr: EventEmitter;
	stdout: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
	const child = new EventEmitter() as FakeChild;
	child.stderr = new EventEmitter();
	child.stdout = new EventEmitter();
	child.kill = vi.fn();
	return child;
}

beforeEach(() => {
	spawnMock.mockReset();
	resolveFfmpegMock.mockReset();
});

describe("sceneDetectArgs", () => {
	it("asks FFmpeg for the scene-selected frames' timestamps, no audio or subtitles", () => {
		const args = sceneDetectArgs("/clip.mp4", 0.4);
		expect(args).toContain("-i");
		expect(args[args.indexOf("-i") + 1]).toBe("/clip.mp4");
		expect(args).toContain("select='gt(scene,0.4)',showinfo");
		expect(args).toContain("-an");
		expect(args).toContain("-sn");
		// A null muxer decodes the file without writing one, and `-progress pipe:1` feeds the bar.
		expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
		expect(args[args.indexOf("-progress") + 1]).toBe("pipe:1");
	});
});

describe("parseProgressMicros", () => {
	it("reads the last reported output time", () => {
		expect(parseProgressMicros("out_time_us=1500000\nprogress=continue\n")).toBe(1_500_000);
		expect(parseProgressMicros("out_time_ms=2500000\nprogress=end\n")).toBe(2_500_000);
	});

	it("returns null when the chunk carries no time", () => {
		expect(parseProgressMicros("progress=continue\n")).toBeNull();
	});
});

describe("parseSceneCuts", () => {
	it("reads every kept frame's pts_time and sorts it", () => {
		const stderr = [
			"[Parsed_showinfo_2 @ 0x1] n:   0 pts:  30 pts_time:1.001 duration:1",
			"[Parsed_showinfo_2 @ 0x1] n:   1 pts:  45 pts_time:1.5 duration:1",
			"[Parsed_showinfo_2 @ 0x1] n:   2 pts:  90 pts_time:3 duration:1",
			"frame= 12 fps=0.0 q=-0.0 size=N/A time=00:00:03.00 bitrate=N/A",
		].join("\n");
		expect(parseSceneCuts(stderr)).toEqual([1.001, 1.5, 3]);
	});

	it("ignores a second at zero — the file's head is not a scene change", () => {
		expect(parseSceneCuts("pts_time:0.000 pts_time:2.5")).toEqual([2.5]);
	});
});

describe("filterSceneCuts", () => {
	it("keeps one cut per minimum scene length, not a stack of micro-clips", () => {
		// 0.2 s and 0.4 s are flashes on either side of the cut at 1.0; 2.5 is a real shot.
		expect(filterSceneCuts([0.2, 1.0, 1.1, 1.2, 2.5], 0.5)).toEqual([0.2, 1.0, 2.5]);
	});

	it("drops non-positive and non-finite times", () => {
		expect(filterSceneCuts([-1, 0, 1, Number.NaN], 0.5)).toEqual([1]);
	});
});

describe("detectScenes", () => {
	it("returns the parsed, filtered cuts on a clean exit", async () => {
		const child = fakeChild();
		resolveFfmpegMock.mockReturnValue("/ffmpeg");
		spawnMock.mockReturnValue(child as never);

		const pending = detectScenes("/clip.mp4", { minSceneSec: 0.5 });
		child.stderr.emit("data", Buffer.from("pts_time:1.0 pts_time:1.1 pts_time:2.5"));
		child.emit("close", 0);

		await expect(pending).resolves.toEqual({ success: true, cutsSec: [1.0, 2.5] });
		expect(spawnMock).toHaveBeenCalledWith(
			"/ffmpeg",
			sceneDetectArgs("/clip.mp4", 0.4),
			expect.objectContaining({ windowsHide: true }),
		);
	});

	it("degrades when the install has no FFmpeg, without spawning", async () => {
		resolveFfmpegMock.mockReturnValue(null);
		await expect(detectScenes("/clip.mp4")).resolves.toEqual({
			success: false,
			cutsSec: [],
			message: "FFmpeg is not available in this install, so scenes cannot be detected.",
			reason: "no-ffmpeg",
		});
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("comes back failed on a non-zero exit, keeping any cuts it did parse", async () => {
		const child = fakeChild();
		resolveFfmpegMock.mockReturnValue("/ffmpeg");
		spawnMock.mockReturnValue(child as never);

		const pending = detectScenes("/clip.mp4");
		child.stderr.emit("data", Buffer.from("pts_time:3.0"));
		child.emit("close", 1);

		await expect(pending).resolves.toEqual({
			success: false,
			cutsSec: [3.0],
			message: "FFmpeg exited 1 while scanning for scenes.",
		});
	});

	it("kills the decode when the caller aborts", async () => {
		const child = fakeChild();
		resolveFfmpegMock.mockReturnValue("/ffmpeg");
		spawnMock.mockReturnValue(child as never);
		const controller = new AbortController();

		const pending = detectScenes("/clip.mp4", { signal: controller.signal });
		controller.abort();

		await expect(pending).resolves.toEqual({
			success: false,
			cutsSec: [],
			message: "Scene detection was cancelled.",
		});
		expect(child.kill).toHaveBeenCalledWith("SIGKILL");
	});

	it("turns FFmpeg's progress lines into a fraction of the known duration", async () => {
		const child = fakeChild();
		resolveFfmpegMock.mockReturnValue("/ffmpeg");
		spawnMock.mockReturnValue(child as never);
		const seen: number[] = [];

		const pending = detectScenes("/clip.mp4", {
			durationSec: 10,
			onProgress: (fraction) => seen.push(fraction),
		});
		child.stdout.emit("data", Buffer.from("out_time_us=2500000\nprogress=continue\n"));
		child.stdout.emit("data", Buffer.from("out_time_us=7500000\nprogress=continue\n"));
		child.emit("close", 0);
		await pending;

		// 2.5/10 then 7.5/10 from the decode, then 1 on a clean exit.
		expect(seen[0]).toBeCloseTo(0.25, 6);
		expect(seen.at(-2)).toBeCloseTo(0.75, 6);
		expect(seen.at(-1)).toBe(1);
	});
});
