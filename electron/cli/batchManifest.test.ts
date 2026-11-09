import path from "node:path";
import { describe, expect, it } from "vitest";
import { batchExportArgv, parseBatchManifest } from "./batchManifest";

const DIR = path.resolve("/work/jobs");

function parse(jobs: unknown, extra: Record<string, unknown> = {}) {
	return parseBatchManifest(JSON.stringify({ jobs, ...extra }), DIR);
}

describe("parseBatchManifest", () => {
	it("resolves relative paths against the manifest directory and applies defaults", () => {
		const manifest = parse([{ project: "a.openscreen" }]);
		expect(manifest.failFast).toBe(false);
		expect(manifest.jobs[0]).toMatchObject({
			projectPath: path.resolve(DIR, "a.openscreen"),
			outPath: null,
			format: null,
			quality: null,
			mp4FrameRate: 60,
			gifFrameRate: null,
			gifSizePreset: null,
			gifLoop: null,
			autoZoom: false,
			audioPath: null,
			audioMode: "mix",
			audioOffsetSec: 0,
		});
	});

	it("keeps explicit paths and options", () => {
		const manifest = parse(
			[
				{
					project: "/abs/b.openscreen",
					out: "out/b.gif",
					format: "gif",
					quality: "1440p",
					fps: 30,
					gifFps: 20,
					gifSize: "large",
					gifLoop: false,
					autoZoom: true,
					audio: "voice.wav",
					audioMode: "replace",
					audioOffset: 1.5,
				},
			],
			{ failFast: true },
		);
		expect(manifest.failFast).toBe(true);
		expect(manifest.jobs[0]).toMatchObject({
			projectPath: "/abs/b.openscreen",
			outPath: path.resolve(DIR, "out/b.gif"),
			format: "gif",
			quality: "1440p",
			mp4FrameRate: 30,
			gifFrameRate: 20,
			gifSizePreset: "large",
			gifLoop: false,
			autoZoom: true,
			audioPath: path.resolve(DIR, "voice.wav"),
			audioMode: "replace",
			audioOffsetSec: 1.5,
		});
	});

	it("rejects a manifest that is not an object or has no jobs", () => {
		expect(() => parseBatchManifest("[]", DIR)).toThrow(/JSON object/);
		expect(() => parseBatchManifest("{", DIR)).toThrow(/not valid JSON/);
		expect(() => parse([])).toThrow(/non-empty "jobs"/);
	});

	it("rejects an unknown key instead of silently ignoring a typo", () => {
		expect(() => parse([{ project: "a.openscreen", qulity: "good" }])).toThrow(
			/unknown key "qulity"/,
		);
		expect(() => parse([{ project: "a.openscreen" }], { failFastt: true })).toThrow(
			/unknown key "failFastt"/,
		);
	});

	it("names the offending job and field", () => {
		expect(() => parse([{ project: "a.openscreen" }, { out: "b.mp4" }])).toThrow(
			/jobs\[1\].*missing "project"/,
		);
		expect(() => parse([{ project: "a.openscreen", fps: 50 }])).toThrow(/jobs\[0\]\.fps/);
		expect(() => parse([{ project: "a.openscreen", format: "webm" }])).toThrow(/jobs\[0\]\.format/);
		expect(() => parse([{ project: "a.openscreen", quality: "4k" }])).toThrow(/jobs\[0\]\.quality/);
		expect(() => parse([{ project: "a.openscreen", gifFps: 12 }])).toThrow(/jobs\[0\]\.gifFps/);
		expect(() => parse([{ project: "a.openscreen", gifSize: "huge" }])).toThrow(
			/jobs\[0\]\.gifSize/,
		);
		expect(() => parse([{ project: "a.openscreen", audioMode: "duck" }])).toThrow(
			/jobs\[0\]\.audioMode/,
		);
		expect(() => parse([{ project: "a.openscreen", audioOffset: -1 }])).toThrow(
			/jobs\[0\]\.audioOffset/,
		);
	});
});

describe("batchExportArgv", () => {
	const base = parseBatchManifest(JSON.stringify({ jobs: [{ project: "a.openscreen" }] }), DIR)
		.jobs[0] as ReturnType<typeof parseBatchManifest>["jobs"][number];

	it("emits the minimal export command", () => {
		expect(batchExportArgv(base)).toEqual([
			"export",
			path.resolve(DIR, "a.openscreen"),
			"--fps",
			"60",
		]);
	});

	it("maps every option to the export CLI's own flag", () => {
		const job = {
			...base,
			outPath: path.resolve(DIR, "out.mp4"),
			format: "mp4" as const,
			quality: "2160p" as const,
			mp4FrameRate: 30 as const,
			audioPath: path.resolve(DIR, "voice.wav"),
			audioMode: "replace" as const,
			audioOffsetSec: 2,
		};
		expect(batchExportArgv(job)).toEqual([
			"export",
			job.projectPath,
			"--out",
			job.outPath,
			"--format",
			"mp4",
			"--quality",
			"2160p",
			"--fps",
			"30",
			"--audio",
			job.audioPath,
			"--audio-mode",
			"replace",
			"--audio-offset",
			"2",
		]);
	});
});
