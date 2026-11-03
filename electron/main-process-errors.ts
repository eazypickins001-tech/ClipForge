// ponytail: Electron 28+ terminates on uncaughtException/unhandledRejection.
// Renderer reload / DevTools detach routinely produces EPIPE on in-flight
// IPC replies — churn, not a bug. Swallow the expected codes; re-throw the
// rest so genuine failures still kill the app.

import { appendDiagnostic, describeForLog, formatThrown } from "./diagnostic-log";

const SWALLOWED_ERROR_CODES = new Set(["EPIPE", "ECONNRESET", "ERR_STREAM_DESTROYED"]);

export function shouldSwallowMainProcessError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as NodeJS.ErrnoException).code;
	return code !== undefined && SWALLOWED_ERROR_CODES.has(code);
}

/**
 * `userDataDir` is optional so the guards still work before the app has decided where its data
 * lives (the CLI path installs them early). When it is absent the handlers behave exactly as
 * before, console-only.
 */
export function installMainProcessErrorGuards(options?: { userDataDir?: string }): void {
	const userDataDir = options?.userDataDir;
	const record = (kind: string, detail: string) => {
		if (userDataDir) appendDiagnostic(userDataDir, kind, detail);
	};
	// A start marker, so a pasted log says which run produced it even when nothing went wrong.
	record(
		"startup",
		`pid ${process.pid} ${process.platform} ${process.arch} electron ${process.versions.electron ?? "?"}`,
	);

	// The native bridge reports its failures through console.error — "compositor.exportMulti
	// failed", "compositor.readFrame failed", the update checker's outcome. Those lines are what
	// explain a dead preview or a refused export, and process-level crashes alone would leave the
	// log nearly empty for the failures users actually report. Tee rather than replace: the
	// original still writes to stderr, which is what CI and `npm run dev` read.
	if (userDataDir) {
		const echo = console.error.bind(console);
		console.error = (...args: unknown[]) => {
			echo(...args);
			record("console.error", args.map(describeForLog).join(" "));
		};
	}

	process.on("uncaughtException", (error) => {
		if (shouldSwallowMainProcessError(error)) {
			const e = error as NodeJS.ErrnoException;
			console.warn("[main] swallowed uncaughtException:", e.code, e.message);
			record("swallowed-uncaughtException", `${e.code ?? ""} ${e.message}`);
			return;
		}
		console.error("[main] uncaughtException:", error);
		// Recorded BEFORE the re-throw below: this handler ends the process, so the file is the
		// only surviving copy.
		record("uncaughtException", formatThrown(error));
		throw error;
	});
	process.on("unhandledRejection", (reason) => {
		if (shouldSwallowMainProcessError(reason)) {
			console.warn("[main] swallowed unhandledRejection:", (reason as NodeJS.ErrnoException).code);
			record("swallowed-unhandledRejection", String((reason as NodeJS.ErrnoException).code ?? ""));
			return;
		}
		console.error("[main] unhandledRejection:", reason);
		record("unhandledRejection", formatThrown(reason));
		throw reason instanceof Error ? reason : new Error(String(reason));
	});
}
