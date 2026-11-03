import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	appendDiagnostic,
	describeForLog,
	diagnosticLogPath,
	formatDiagnosticLine,
	formatThrown,
	scrubSecrets,
} from "./diagnostic-log";

const dirs: string[] = [];
function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-diagnostic-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("scrubSecrets", () => {
	it("redacts provider keys, bearer headers and key=value pairs", () => {
		const out = scrubSecrets(
			"call failed sk-or-v1-abcdef123456 with Bearer abcdef1234567890 and apiKey=supersecret123",
		);
		expect(out).not.toContain("abcdef123456");
		expect(out).not.toContain("supersecret123");
		expect(out).toContain("[redacted]");
	});

	it("leaves ordinary error text alone", () => {
		// The line that started all this: it must survive verbatim, or the log stops being
		// evidence.
		const line = "open_input: -2 (No such file or directory)";
		expect(scrubSecrets(line)).toBe(line);
	});
});

describe("formatDiagnosticLine", () => {
	it("is one ISO-stamped line even for a multi-line stack", () => {
		const line = formatDiagnosticLine(
			"uncaughtException",
			"Error: boom\n    at a\n    at b",
			new Date("2026-11-02T00:00:00.000Z"),
		);
		expect(line).toBe("2026-11-02T00:00:00.000Z [uncaughtException] Error: boom | at a | at b\n");
	});
});

describe("formatThrown", () => {
	it("keeps the errno code and the stack, because that is the useful part", () => {
		const error = Object.assign(new Error("no such file"), { code: "ENOENT" });
		const text = formatThrown(error);
		expect(text).toContain("ENOENT");
		expect(text).toContain("no such file");
		expect(text).toContain("Error");
	});
});

describe("describeForLog", () => {
	it("renders strings verbatim, errors with their stack, objects as JSON", () => {
		expect(describeForLog("plain")).toBe("plain");
		expect(describeForLog(new Error("boom"))).toContain("Error: boom");
		expect(describeForLog({ url: "/x", status: 404 })).toBe('{"url":"/x","status":404}');
	});

	it("survives a circular object instead of throwing inside the logger", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => describeForLog(circular)).not.toThrow();
	});
});

describe("appendDiagnostic", () => {
	it("creates logs/clipforge.log and appends scrubbed entries", () => {
		const dir = tempDir();
		appendDiagnostic(dir, "startup", "pid 1");
		appendDiagnostic(dir, "error", "token=abcdef123456");

		const body = fs.readFileSync(diagnosticLogPath(dir), "utf8");
		expect(body).toContain("[startup] pid 1");
		expect(body).toContain("[redacted]");
		expect(body).not.toContain("abcdef123456");
	});

	it("rotates to .1 once past the size cap", () => {
		const dir = tempDir();
		const file = diagnosticLogPath(dir);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, "x".repeat(600 * 1024));

		appendDiagnostic(dir, "startup", "after rotation");

		expect(fs.existsSync(`${file}.1`)).toBe(true);
		expect(fs.readFileSync(file, "utf8")).toContain("after rotation");
	});

	it("never throws, even when the directory cannot be created", () => {
		// A logger that throws inside a crash handler replaces the crash it was recording.
		expect(() => appendDiagnostic("\0invalid\0path", "error", "boom")).not.toThrow();
	});
});
