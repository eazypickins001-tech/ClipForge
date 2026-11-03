/**
 * The on-disk diagnostic log.
 *
 * Why a file at all: a packaged Windows app has no console a user can read, so every bug report
 * so far arrived as a screenshot of a single line. This keeps the recent warnings and errors
 * somewhere the user can copy from and paste into a message.
 *
 * SECRETS are redacted rather than refused. The workbench refuses to persist a payload that
 * contains an API key, which is possible because it chooses what to write; a crash log cannot
 * refuse — the failure is the point — so it scrubs instead.
 *
 * Every function here swallows its own I/O errors on purpose: a logger that throws inside a crash
 * handler would replace the crash it was called to record.
 */
import fs from "node:fs";
import path from "node:path";

/** Rotate at half a megabyte. A crash loop can produce a lot of lines fast, and the useful part
 *  is always the tail. */
const MAX_BYTES = 512 * 1024;

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
	// Provider API keys, e.g. OpenRouter's `sk-or-v1-…` and OpenAI's `sk-…`.
	[/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]"],
	// Authorization headers, however they end up stringified into a message.
	[/\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, "$1[redacted]"],
	// `apiKey=…`, `token: …`, `password=…` in a query string, JSON fragment or error message.
	[
		/((?:api[_-]?key|token|secret|password)["']?\s*[=:]\s*["']?)([^\s,;"'&}]{6,})/gi,
		"$1[redacted]",
	],
];

export function scrubSecrets(text: string): string {
	let out = text;
	for (const [pattern, replacement] of SECRET_PATTERNS) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

export function diagnosticLogPath(userDataDir: string): string {
	return path.join(userDataDir, "logs", "clipforge.log");
}

/** One line, ISO-stamped, with secrets removed. */
export function formatDiagnosticLine(kind: string, detail: string, now = new Date()): string {
	return `${now.toISOString()} [${kind}] ${scrubSecrets(detail).replace(/\s*\n\s*/g, " | ")}\n`;
}

function rotateIfNeeded(filePath: string): void {
	try {
		if (fs.statSync(filePath).size < MAX_BYTES) return;
		fs.renameSync(filePath, `${filePath}.1`);
	} catch {
		// No file yet, or one another process holds. Appending regardless is better than
		// losing the entry.
	}
}

export function appendDiagnostic(userDataDir: string, kind: string, detail: string): void {
	try {
		const filePath = diagnosticLogPath(userDataDir);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		rotateIfNeeded(filePath);
		fs.appendFileSync(filePath, formatDiagnosticLine(kind, detail));
	} catch {
		// See the module header: never throw from here.
	}
}

/** Flattens anything thrown into a line worth reading, keeping the stack. */
export function formatThrown(error: unknown): string {
	if (error instanceof Error) {
		const code = (error as NodeJS.ErrnoException).code;
		const head = code
			? `${error.name} (${code}): ${error.message}`
			: `${error.name}: ${error.message}`;
		return error.stack ? `${head}\n${error.stack}` : head;
	}
	return String(error);
}

/** Best-effort one-line rendering of a `console.error` argument. */
export function describeForLog(value: unknown): string {
	if (typeof value === "string") return value;
	if (value instanceof Error) return formatThrown(value);
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		// Circular structures land here. A type name is better than nothing.
		return Object.prototype.toString.call(value);
	}
}
