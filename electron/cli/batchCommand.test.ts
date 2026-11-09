import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runBatchCommand, type SpawnBatch } from "./batchCommand";

const MANIFEST = path.join(os.tmpdir(), "clipforge-batch-test", "batch.json");
const DIR = path.dirname(MANIFEST);

function manifest(jobs: unknown[], failFast = false) {
	return JSON.stringify({ jobs, failFast });
}

function fakeSpawn(codes: number[]) {
	const calls: Array<{ argv: string[]; stdio: unknown }> = [];
	const spawnImpl: SpawnBatch = ((argv: string[], options: { stdio: unknown }) => {
		const child = new EventEmitter() as EventEmitter & {
			stdout: { resume: () => void };
		};
		child.stdout = { resume: vi.fn() };
		const code = codes[calls.length] ?? 0;
		calls.push({ argv, stdio: options.stdio });
		queueMicrotask(() => child.emit("exit", code, null));
		return child;
	}) as unknown as SpawnBatch;
	return { spawnImpl, calls };
}

function run(
	text: string,
	options: {
		codes?: number[];
		json?: boolean;
		failFast?: boolean;
		isPackaged?: boolean;
		appPath?: string;
		readError?: Error;
	} = {},
) {
	const { spawnImpl, calls } = fakeSpawn(options.codes ?? [0]);
	const out: string[] = [];
	const err: string[] = [];
	const promise = runBatchCommand(MANIFEST, {
		json: options.json ?? false,
		failFast: options.failFast ?? false,
		execPath: "C:\\ClipForge.exe",
		appPath: options.appPath ?? "C:\\repo",
		isPackaged: options.isPackaged ?? true,
		write: (chunk) => out.push(chunk),
		writeError: (chunk) => err.push(chunk),
		spawnImpl,
		readFile: async () => {
			if (options.readError) throw options.readError;
			return text;
		},
	});
	return { promise, calls, out, err };
}

describe("runBatchCommand", () => {
	it("exports each job in order through the packaged executable", async () => {
		const result = run(manifest([{ project: "a.openscreen" }, { project: "b.openscreen" }]));
		await expect(result.promise).resolves.toBe(0);
		expect(result.calls.map((call) => call.argv)).toEqual([
			["export", path.resolve(DIR, "a.openscreen"), "--fps", "60"],
			["export", path.resolve(DIR, "b.openscreen"), "--fps", "60"],
		]);
		expect(result.calls[0]?.stdio).toBe("inherit");
	});

	it("prepends the app path to a dev-build executable", async () => {
		const result = run(manifest([{ project: "a.openscreen" }]), {
			isPackaged: false,
			appPath: "C:\\repo",
		});
		await expect(result.promise).resolves.toBe(0);
		expect(result.calls[0]?.argv).toEqual([
			"C:\\repo",
			"export",
			path.resolve(DIR, "a.openscreen"),
			"--fps",
			"60",
		]);
	});

	it("keeps going after a failure and reports both jobs", async () => {
		const result = run(manifest([{ project: "a.openscreen" }, { project: "b.openscreen" }]), {
			codes: [1, 0],
			json: true,
		});
		await expect(result.promise).resolves.toBe(1);
		expect(result.calls).toHaveLength(2);
		const events = result.out.map((line) => JSON.parse(line.trim()));
		expect(events[0]).toEqual({ type: "batch-start", jobs: 2 });
		expect(events.find((event) => event.type === "done")).toMatchObject({
			succeeded: 1,
			failed: 1,
			skipped: 0,
		});
	});

	it("stops after the first failure when failFast is set", async () => {
		const result = run(manifest([{ project: "a.openscreen" }, { project: "b.openscreen" }], true), {
			codes: [1, 0],
			json: true,
		});
		await expect(result.promise).resolves.toBe(1);
		expect(result.calls).toHaveLength(1);
		const done = result.out.map((line) => JSON.parse(line.trim())).at(-1);
		expect(done).toMatchObject({ type: "done", succeeded: 0, failed: 1, skipped: 1 });
	});

	it("returns 2 and writes the manifest error on stderr", async () => {
		const result = run("not json");
		await expect(result.promise).resolves.toBe(2);
		expect(result.err.join("")).toMatch(/not valid JSON/);
		expect(result.calls).toHaveLength(0);
	});
});
