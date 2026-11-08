// Scene changes over a source file, read by FFmpeg's own `scene` score.
//
// This is the one detection capability ClipForge does not get from the compositor: a shot change is
// a property of the MEDIA, not of the render scene, so it has to come from a decode pass. FFmpeg's
// video `scene` score is built into the LGPL build the app already ships (no extra library); the
// filter below keeps only the frames it scores above the threshold, and `showinfo` prints each kept
// frame's `pts_time`, which is exactly the source second the new shot starts at.
//
// The pass is deliberately main-process work, spawned beside `media/audioPeaks.ts` and resolved by
// the same `resolveFfmpeg` (which knows the packaged `ffmpeg-shared.exe` shape). The renderer only
// sees the resulting source seconds and turns them into splits.

import { spawn } from "node:child_process";
import { resolveFfmpeg } from "./audioPeaks";

/** What the renderer may ask for; everything here is JSON-serializable across IPC. */
export interface SceneDetectRequest {
	/** FFmpeg's `scene` score, 0..1. Higher means fewer, larger cuts. */
	threshold?: number;
	/** Do not report two cuts closer than this, so a flash or a wipe cannot make micro-clips. */
	minSceneSec?: number;
	/** Give up after this long. A wedged decode is not a detection. */
	timeoutMs?: number;
	/** The source's duration, used only to turn FFmpeg's progress into a fraction. */
	durationSec?: number;
}

/** Main-process options: the request plus the cancellation signal and progress (never cross IPC). */
export interface SceneDetectOptions extends SceneDetectRequest {
	signal?: AbortSignal;
	/** 0..1 as the decode advances; also called with 1 on a clean exit. */
	onProgress?: (fraction: number) => void;
}

export interface SceneDetectResult {
	success: boolean;
	/** Source seconds where a new scene begins, ascending. Empty on failure. */
	cutsSec: number[];
	message?: string;
	/** A machine-readable cause for the one failure the UI localises. */
	reason?: "no-ffmpeg";
}

/** FFmpeg's documented default for scene detection, and a sane one for a first pass. */
const DEFAULT_THRESHOLD = 0.4;
/** A 0.5 s shot is already a flash on most footage; shorter is not a scene to an editor. */
const DEFAULT_MIN_SCENE_SEC = 0.5;
/** Decoding a long source for scores is CPU-bound, not IO-bound; this is generous. */
const DEFAULT_TIMEOUT_MS = 300_000;
/** `showinfo` prints one line per selected frame; cap the buffer in case a threshold selects all. */
const STDERR_CAP = 2 * 1024 * 1024;
const PTS_TIME = /pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g;
/** FFmpeg's `-progress` writer reports microseconds; both spellings do (its `_ms` is a legacy name). */
const PROGRESS_TIME = /^(?:out_time_us|out_time_ms)=(\d+)\s*$/;

/** Pure: the argument vector, so the test pins the filter expression without spawning. */
export function sceneDetectArgs(filePath: string, threshold: number): string[] {
	return [
		"-hide_banner",
		"-nostdin",
		"-loglevel",
		"info",
		"-i",
		filePath,
		"-an",
		"-sn",
		"-dn",
		"-vf",
		`select='gt(scene,${threshold})',showinfo`,
		"-progress",
		"pipe:1",
		"-f",
		"null",
		"-",
	];
}

/** Pure: the last `out_time_us`/`out_time_ms` in one `-progress` chunk, in microseconds. */
export function parseProgressMicros(chunk: string): number | null {
	let last: number | null = null;
	for (const line of chunk.split("\n")) {
		const match = PROGRESS_TIME.exec(line.trim());
		if (match) last = Number(match[1]);
	}
	return last;
}

/**
 * Pure: every `pts_time` FFmpeg printed, in source seconds, ascending.
 *
 * `showinfo` is the only filter asked to log, so any `pts_time` in the buffer is a kept frame — the
 * first frame of a new scene. Duplicates are left to {@link filterSceneCuts}, which owns the
 * minimum-gap rule.
 */
export function parseSceneCuts(stderr: string): number[] {
	const cuts: number[] = [];
	for (const match of stderr.matchAll(PTS_TIME)) {
		const sec = Number(match[1]);
		if (Number.isFinite(sec) && sec > 0) cuts.push(sec);
	}
	return cuts.sort((a, b) => a - b);
}

/**
 * Pure: keep a cut only when it is at least `minSceneSec` past the previous kept one, so a rapid
 * flash or a wipe cannot become a stack of micro-clips. A cut at 0 is the file's own head, not a
 * scene change.
 */
export function filterSceneCuts(cuts: readonly number[], minSceneSec: number): number[] {
	const gap = Math.max(0.01, minSceneSec);
	const kept: number[] = [];
	for (const sec of cuts) {
		if (!(sec > 0)) continue;
		const previous = kept.at(-1);
		if (previous === undefined || sec - previous >= gap) kept.push(sec);
	}
	return kept;
}

/**
 * Scan `filePath` and return the source seconds where its scenes change.
 *
 * Degrades, never throws: no FFmpeg (a real packaged case), a file FFmpeg cannot open, a timeout or
 * an abort all come back as `success: false` with a message the caller can show. Cancellation kills
 * the child rather than leaving a decode running behind a dismissed toast.
 */
export async function detectScenes(
	filePath: string,
	options: SceneDetectOptions = {},
): Promise<SceneDetectResult> {
	const ffmpeg = resolveFfmpeg();
	if (!ffmpeg) {
		return {
			success: false,
			cutsSec: [],
			message: "FFmpeg is not available in this install, so scenes cannot be detected.",
			reason: "no-ffmpeg",
		};
	}
	const signal = options.signal;
	if (signal?.aborted) {
		return { success: false, cutsSec: [], message: "Scene detection was cancelled." };
	}
	const threshold = Math.min(1, Math.max(0.01, options.threshold ?? DEFAULT_THRESHOLD));
	const minSceneSec = Math.max(0.05, options.minSceneSec ?? DEFAULT_MIN_SCENE_SEC);
	const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

	return await new Promise<SceneDetectResult>((resolve) => {
		let settled = false;
		let stderr = "";
		const child = spawn(ffmpeg, sceneDetectArgs(filePath, threshold), {
			windowsHide: true,
			// stdout is `-progress pipe:1`; the scene lines are on stderr.
			stdio: ["ignore", "pipe", "pipe"],
		});
		let timer: NodeJS.Timeout;
		const durationSec = options.durationSec ?? 0;
		let lastReported = -1;
		let lastReportedAt = 0;
		const reportProgress = (micros: number) => {
			if (!(durationSec > 0) || !options.onProgress) return;
			const fraction = Math.min(1, Math.max(0, micros / (durationSec * 1_000_000)));
			const now = Date.now();
			// At most ~4 updates a second, and at least a point each: a UI bar does not need
			// every packet, and a value that does not move is not news.
			if (fraction - lastReported < 0.01 && now - lastReportedAt < 250) return;
			lastReported = fraction;
			lastReportedAt = now;
			options.onProgress(fraction);
		};
		const finish = (result: SceneDetectResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			if (result.success) options.onProgress?.(1);
			resolve(result);
		};
		const onAbort = () => {
			child.kill("SIGKILL");
			finish({ success: false, cutsSec: [], message: "Scene detection was cancelled." });
		};
		timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish({
				success: false,
				cutsSec: [],
				message: `Scene detection timed out after ${Math.round(timeoutMs / 1000)}s.`,
			});
		}, timeoutMs);
		signal?.addEventListener("abort", onAbort, { once: true });

		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-STDERR_CAP);
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			const micros = parseProgressMicros(chunk.toString());
			if (micros !== null) reportProgress(micros);
		});
		child.once("error", (error) => {
			finish({ success: false, cutsSec: [], message: String(error) });
		});
		child.once("close", (code) => {
			const cuts = filterSceneCuts(parseSceneCuts(stderr), minSceneSec);
			if (code === 0) {
				finish({ success: true, cutsSec: cuts });
				return;
			}
			finish({
				success: false,
				cutsSec: cuts,
				message: `FFmpeg exited ${code} while scanning for scenes.`,
			});
		});
	});
}
