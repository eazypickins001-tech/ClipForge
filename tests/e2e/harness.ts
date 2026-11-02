// Shared launch helpers for the Electron e2e specs. Not a spec itself: no
// `test()` is registered here, so importing it never adds a test.
//
// Set CLIPFORGE_APP_EXE to a packaged ClipForge.exe to exercise the shipped build
// instead of the dev bundle. Native export is hard-gated on compositor_view.node,
// which a dev checkout does not contain, so the export path can only run to
// completion in the packaged app — locally from a downloaded artifact, or in CI.
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const MAIN_JS = path.join(ROOT, "dist-electron/main.js");

export const FIXTURES_DIR = path.join(__dirname, "../fixtures");
export const TEST_VIDEO = path.join(FIXTURES_DIR, "sample.webm");
export const PACKAGED_APP = process.env["CLIPFORGE_APP_EXE"];

export type ElectronApplication = Awaited<ReturnType<typeof electron.launch>>;

export async function launchApp(userDataDir: string, tmpDir: string): Promise<ElectronApplication> {
	const app = await electron.launch({
		...(PACKAGED_APP ? { executablePath: PACKAGED_APP } : {}),
		args: [
			...(PACKAGED_APP ? [] : [MAIN_JS]),
			// Required in CI sandbox environments (GitHub Actions, Docker, etc.)
			"--no-sandbox",
			// Force software WebGL in headless CI to avoid GPU framebuffer errors.
			"--enable-unsafe-swiftshader",
			// The selectors below are the English accessible names, so pin the locale.
			"--lang=en-US",
			`--user-data-dir=${userDataDir}`,
		],
		env: {
			...process.env,
			ELECTRON_USER_DATA_DIR: userDataDir,
			// Keep this run's scratch files out of the shared temp dir so a dev instance
			// cannot collide with them. The single-instance lock keys on userData, which
			// `--user-data-dir` above already makes private to this launch.
			TMPDIR: tmpDir,
			TMP: tmpDir,
			TEMP: tmpDir,
			// Set HEADLESS=false to show windows while debugging.
			HEADLESS: process.env["HEADLESS"] ?? "true",
			LANG: "en_US.UTF-8",
			LC_ALL: "en_US.UTF-8",
			LANGUAGE: "en_US",
		},
	});

	app.process().stdout?.on("data", (d) => process.stdout.write(`[electron] ${d}`));
	app.process().stderr?.on("data", (d) => process.stderr.write(`[electron] ${d}`));
	return app;
}

export async function closeApp(app: ElectronApplication): Promise<void> {
	const childProcess = app.process();
	await Promise.race([app.close(), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
	if (childProcess.exitCode === null && childProcess.signalCode === null) {
		if (!childProcess.killed) {
			childProcess.kill("SIGKILL");
		}
		await Promise.race([
			once(childProcess, "close"),
			new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
		]);
	}
}

/**
 * Switches to the editor window and returns it once the renderer has loaded.
 * Seeds nothing: the shell loads the first project it finds on mount, so this is
 * the "reopen the app" path.
 */
export async function openEditorWindow(app: ElectronApplication): Promise<Page> {
	const hudWindow = await app.firstWindow({ timeout: 60_000 });
	await hudWindow.waitForLoadState("domcontentloaded");

	try {
		await hudWindow.evaluate(() => window.electronAPI.switchToEditor());
	} catch (error) {
		// The HUD may close itself as part of the switch; only that is tolerable.
		if (
			!(error instanceof Error) ||
			!/closed|destroyed|target page|target closed/i.test(error.message)
		) {
			throw error;
		}
	}

	const editorWindow = await app.waitForEvent("window", {
		predicate: (w) => w.url().includes("windowType=editor"),
		timeout: 15_000,
	});

	// WebCodecs may not be registered in the renderer on first load.
	await editorWindow.reload();
	await editorWindow.waitForLoadState("domcontentloaded");
	return editorWindow;
}

/**
 * Hands `videoPath` to the app the way a finished recording arrives, then opens
 * the editor.
 *
 * The recording is not imported by this helper: the editor imports it into its
 * project on mount, so callers wait for a `[data-clip-id]` pill as the signal
 * that the import landed.
 */
export async function openEditorWithRecording(
	app: ElectronApplication,
	videoPath: string,
): Promise<Page> {
	const hudWindow = await app.firstWindow({ timeout: 60_000 });
	await hudWindow.waitForLoadState("domcontentloaded");

	await hudWindow.evaluate((p: string) => window.electronAPI.setCurrentVideoPath(p), videoPath);
	return openEditorWindow(app);
}
