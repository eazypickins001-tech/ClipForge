// The headless batch contract: a JSON manifest of export jobs, validated before any renderer is
// spawned, and the export argv each job becomes. Pure except for `node:path`, so the CLI tests can
// pin it without Electron.
//
// A job's paths are resolved relative to the manifest file, not the caller's cwd: a manifest is a
// portable description, and `openscreen batch jobs/evening.json` must behave the same from any
// directory.

import path from "node:path";
import {
	type ExportQuality,
	GIF_SIZE_PRESETS,
	type GifFrameRate,
	type GifSizePreset,
	isValidGifFrameRate,
	MP4_FRAME_RATES,
	type Mp4FrameRate,
} from "../../src/lib/exporter/types";

export type CliBatchFormat = "mp4" | "gif" | "wav" | "m4a";

const FORMATS: readonly CliBatchFormat[] = ["mp4", "gif", "wav", "m4a"];
const QUALITIES: readonly ExportQuality[] = ["medium", "good", "1440p", "2160p", "source"];
const GIF_SIZES = Object.keys(GIF_SIZE_PRESETS) as GifSizePreset[];
const JOB_KEYS = new Set([
	"project",
	"out",
	"format",
	"quality",
	"fps",
	"gifFps",
	"gifSize",
	"gifLoop",
	"autoZoom",
	"audio",
	"audioMode",
	"audioOffset",
]);
const MANIFEST_KEYS = new Set(["jobs", "failFast"]);

export interface CliBatchJob {
	projectPath: string;
	outPath: string | null;
	format: CliBatchFormat | null;
	quality: ExportQuality | null;
	mp4FrameRate: Mp4FrameRate;
	gifFrameRate: GifFrameRate | null;
	gifSizePreset: GifSizePreset | null;
	gifLoop: boolean | null;
	autoZoom: boolean;
	audioPath: string | null;
	audioMode: "mix" | "replace";
	audioOffsetSec: number;
}

export interface CliBatchManifest {
	jobs: CliBatchJob[];
	failFast: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, where: string) {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw new Error(`${where} has unknown key "${key}"`);
		}
	}
}

function readPath(
	value: unknown,
	key: string,
	where: string,
	manifestDir: string,
	required: boolean,
): string | null {
	if (value === undefined) {
		if (required) throw new Error(`${where} is missing "${key}"`);
		return null;
	}
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${where}.${key} must be a non-empty string`);
	}
	const resolved = path.isAbsolute(value) ? value : path.resolve(manifestDir, value);
	return resolved;
}

function readOptionalBoolean(
	value: unknown,
	key: string,
	where: string,
	fallback: boolean,
): boolean {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") throw new Error(`${where}.${key} must be true or false`);
	return value;
}

function readOptionalNumber(value: unknown, key: string, where: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${where}.${key} must be a finite number`);
	}
	return value;
}

function parseJob(value: unknown, index: number, manifestDir: string): CliBatchJob {
	const where = `jobs[${index}]`;
	if (!isRecord(value)) throw new Error(`${where} must be an object`);
	rejectUnknownKeys(value, JOB_KEYS, where);

	const projectPath = readPath(value.project, "project", where, manifestDir, true);
	if (!projectPath) throw new Error(`${where} is missing "project"`);

	const format = value.format;
	if (format !== undefined && !FORMATS.includes(format as CliBatchFormat)) {
		throw new Error(`${where}.format must be ${FORMATS.join(", ")}`);
	}

	const quality = value.quality;
	if (quality !== undefined && !QUALITIES.includes(quality as ExportQuality)) {
		throw new Error(`${where}.quality must be ${QUALITIES.join(", ")}`);
	}

	const fps = value.fps;
	if (fps !== undefined && !MP4_FRAME_RATES.includes(fps as Mp4FrameRate)) {
		throw new Error(`${where}.fps must be one of ${MP4_FRAME_RATES.join(", ")}`);
	}

	const gifFps = value.gifFps;
	if (gifFps !== undefined && (typeof gifFps !== "number" || !isValidGifFrameRate(gifFps))) {
		throw new Error(`${where}.gifFps must be one of 15, 20, 25, 30`);
	}

	const gifSize = value.gifSize;
	if (gifSize !== undefined && !GIF_SIZES.includes(gifSize as GifSizePreset)) {
		throw new Error(`${where}.gifSize must be ${GIF_SIZES.join(", ")}`);
	}

	const audioMode = value.audioMode;
	if (audioMode !== undefined && audioMode !== "mix" && audioMode !== "replace") {
		throw new Error(`${where}.audioMode must be mix or replace`);
	}

	const audioOffset = readOptionalNumber(value.audioOffset, "audioOffset", where);
	if (audioOffset !== undefined && audioOffset < 0) {
		throw new Error(`${where}.audioOffset must be 0 or more`);
	}

	return {
		projectPath,
		outPath: readPath(value.out, "out", where, manifestDir, false),
		format: (format as CliBatchFormat | undefined) ?? null,
		quality: (quality as ExportQuality | undefined) ?? null,
		mp4FrameRate: (fps as Mp4FrameRate | undefined) ?? 60,
		gifFrameRate: (gifFps as GifFrameRate | undefined) ?? null,
		gifSizePreset: (gifSize as GifSizePreset | undefined) ?? null,
		gifLoop:
			value.gifLoop === undefined
				? null
				: readOptionalBoolean(value.gifLoop, "gifLoop", where, true),
		autoZoom: readOptionalBoolean(value.autoZoom, "autoZoom", where, false),
		audioPath: readPath(value.audio, "audio", where, manifestDir, false),
		audioMode: (audioMode as "mix" | "replace" | undefined) ?? "mix",
		audioOffsetSec: audioOffset ?? 0,
	};
}

/** Parse and validate a batch manifest. Throws `Error` with the offending job and field. */
export function parseBatchManifest(text: string, manifestDir: string): CliBatchManifest {
	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch (error) {
		throw new Error(`The manifest is not valid JSON: ${String(error)}`);
	}
	if (!isRecord(payload)) throw new Error("The manifest must be a JSON object");
	rejectUnknownKeys(payload, MANIFEST_KEYS, "The manifest");

	if (!Array.isArray(payload.jobs) || payload.jobs.length === 0) {
		throw new Error('The manifest needs a non-empty "jobs" array');
	}
	if (payload.failFast !== undefined && typeof payload.failFast !== "boolean") {
		throw new Error("failFast must be true or false");
	}

	return {
		jobs: payload.jobs.map((job, index) => parseJob(job, index, manifestDir)),
		failFast: payload.failFast === true,
	};
}

/** The argv for one job, starting at the `export` subcommand (the caller prepends the exe path). */
export function batchExportArgv(job: CliBatchJob): string[] {
	const argv = ["export", job.projectPath];
	if (job.outPath) argv.push("--out", job.outPath);
	if (job.format) argv.push("--format", job.format);
	if (job.quality) argv.push("--quality", job.quality);
	argv.push("--fps", String(job.mp4FrameRate));
	if (job.gifFrameRate) argv.push("--gif-fps", String(job.gifFrameRate));
	if (job.gifSizePreset) argv.push("--gif-size", job.gifSizePreset);
	if (job.gifLoop !== null) argv.push(job.gifLoop ? "--gif-loop" : "--no-gif-loop");
	if (job.autoZoom) argv.push("--auto-zoom");
	if (job.audioPath) {
		argv.push("--audio", job.audioPath, "--audio-mode", job.audioMode);
		if (job.audioOffsetSec > 0) argv.push("--audio-offset", String(job.audioOffsetSec));
	}
	return argv;
}
