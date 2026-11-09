// Runs a batch manifest by spawning the app's own export CLI once per job, sequentially. Each
// export gets the same isolated renderer/session data a normal `openscreen export` run gets, and a
// failed job never takes the rest of the batch down unless `failFast` asked it to.
//
// This file is imported by the Electron CLI entry, so it may use node built-ins; the manifest
// validation itself lives in `batchManifest.ts` and is Electron-free.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { batchExportArgv, type CliBatchJob, parseBatchManifest } from "./batchManifest";

export interface BatchChild {
	on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	stdout?: { resume(): void } | null;
}

export type SpawnBatch = (
	command: string,
	args: string[],
	options: { stdio: "inherit" | ["ignore", "pipe", "inherit"] },
) => BatchChild;

export interface RunBatchOptions {
	json: boolean;
	failFast: boolean;
	execPath: string;
	appPath: string;
	isPackaged: boolean;
	write: (text: string) => void;
	writeError: (text: string) => void;
	spawnImpl?: SpawnBatch;
	readFile?: (file: string) => Promise<string>;
}

export interface BatchJobResult {
	index: number;
	project: string;
	out: string | null;
	success: boolean;
	code: number | null;
	error?: string;
}

function oneLine(value: unknown): string {
	return JSON.stringify(value);
}

function runOne(
	command: string,
	args: string[],
	json: boolean,
	spawnImpl: SpawnBatch,
): Promise<{ code: number | null; error?: string }> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (code: number | null, error?: string) => {
			if (settled) return;
			settled = true;
			resolve({ code, ...(error ? { error } : {}) });
		};
		let child: BatchChild;
		try {
			child = spawnImpl(command, args, {
				stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
			});
		} catch (error) {
			finish(1, error instanceof Error ? error.message : String(error));
			return;
		}
		// In JSON mode the child's NDJSON would corrupt the parent's stream. Drain it; the parent
		// emits its own job events.
		child.stdout?.resume();
		child.on("error", (error) => finish(1, error.message));
		child.on("exit", (code) => finish(code));
	});
}

/**
 * Run every job in the manifest at `manifestPath`. Returns the process exit code: 0 when every
 * attempted job succeeded, 1 when any failed. A manifest that cannot be read or parsed exits 2,
 * matching the CLI's argument errors.
 */
export async function runBatchCommand(
	manifestPath: string,
	options: RunBatchOptions,
): Promise<number> {
	const readFile = options.readFile ?? ((file: string) => fs.readFile(file, "utf8"));
	const spawnImpl = options.spawnImpl ?? (spawn as unknown as SpawnBatch);

	let manifest: ReturnType<typeof parseBatchManifest>;
	try {
		manifest = parseBatchManifest(await readFile(manifestPath), path.dirname(manifestPath));
	} catch (error) {
		options.writeError(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}

	const { jobs, failFast } = manifest;
	const failFastJobs = failFast || options.failFast;
	if (options.json) {
		options.write(`${oneLine({ type: "batch-start", jobs: jobs.length })}\n`);
	}

	const prefix = options.isPackaged ? [] : [options.appPath];
	const results: BatchJobResult[] = [];

	for (let index = 0; index < jobs.length; index++) {
		const job = jobs[index] as CliBatchJob;
		if (options.json) {
			options.write(`${oneLine({ type: "job-start", index, project: job.projectPath })}\n`);
		} else {
			options.write(`[${index + 1}/${jobs.length}] ${job.projectPath}\n`);
		}

		const { code, error } = await runOne(
			options.execPath,
			[...prefix, ...batchExportArgv(job)],
			options.json,
			spawnImpl,
		);
		const success = code === 0;
		const result: BatchJobResult = {
			index,
			project: job.projectPath,
			out: job.outPath,
			success,
			code,
			...(error ? { error } : {}),
		};
		results.push(result);

		if (options.json) {
			options.write(`${oneLine({ type: "job-done", ...result })}\n`);
		} else {
			options.write(success ? "  ok\n" : `  failed${error ? `: ${error}` : ` (exit ${code})`}\n`);
		}

		if (!success && failFastJobs) break;
	}

	const succeeded = results.filter((result) => result.success).length;
	const failed = results.length - succeeded;
	const skipped = jobs.length - results.length;
	if (options.json) {
		options.write(`${oneLine({ type: "done", succeeded, failed, skipped, results })}\n`);
	} else {
		options.write(
			`${succeeded} succeeded, ${failed} failed${skipped ? `, ${skipped} not run` : ""}\n`,
		);
	}
	return failed === 0 ? 0 : 1;
}
