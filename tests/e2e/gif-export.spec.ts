import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { closeApp, launchApp, openEditorWithRecording, TEST_VIDEO } from "./harness";

// Teardown must never decide a test's outcome. A packaged app can still hold its
// own recording for a moment after `closeApp`, and Windows answers that with EBUSY.
function removeQuietly(target: string): void {
	try {
		fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	} catch {
		// A leftover scratch directory is not a test failure.
	}
}

/**
 * Drives the v4 editor's Export dialog end to end and returns the bytes it wrote.
 *
 * The native save dialog can't be driven from Playwright, so `pick-export-save-path`
 * is stubbed in the main process to return a temp path. Everything after that is the
 * real pipeline: the dialog hands that path straight to the native exporter
 * (`exportMultiNative` / `exportGifNative`), which writes the file itself — there is
 * no `write-export-to-path` round-trip through the renderer any more, so the test
 * reads the finished file off disk instead of intercepting a buffer.
 */
async function exportFromLoadedVideo(
	format: "gif" | "mp4",
	cancelThenRetry = false,
	validate?: (outputPath: string) => void,
): Promise<Buffer> {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-e2e-export-"));
	const appTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-e2e-tmp-"));
	const outputPath = path.join(appTmpDir, `test-export.${format}`);
	const app = await launchApp(userDataDir, appTmpDir);

	try {
		// The native save dialog can't be driven from Playwright, so the handler is
		// stubbed to return a temp path. Everything downstream of it is the real
		// pipeline.
		await app.evaluate(({ ipcMain }, targetPath: string) => {
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.handle("pick-export-save-path", () => ({
				success: true,
				path: targetPath,
				canceled: false,
			}));
		}, outputPath);

		const recordingsDir = path.join(
			await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")),
			"recordings",
		);
		const testVideoInRecordings = path.join(recordingsDir, "test-sample.webm");
		fs.mkdirSync(recordingsDir, { recursive: true });
		if (cancelThenRetry) {
			// The two-second fixture can finish before a UI click reaches Cancel.
			// Stream-copy repeats into a real eight-second source; no mocked exporter
			// or artificial delay in the native frame walk.
			execFileSync(
				process.env.OPENSCREEN_TEST_FFMPEG ?? "ffmpeg",
				[
					"-v",
					"error",
					"-stream_loop",
					"3",
					"-i",
					TEST_VIDEO,
					"-c",
					"copy",
					"-t",
					"8",
					testVideoInRecordings,
				],
				{ timeout: 20_000 },
			);
			fs.writeFileSync(
				outputPath,
				Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
			);
		} else {
			fs.copyFileSync(TEST_VIDEO, testVideoInRecordings);
		}

		const editorWindow = await openEditorWithRecording(app, testVideoInRecordings);

		// Top bar: the Export control is disabled until the seeded recording has been
		// imported into the project, so waiting for it to be enabled doubles as the
		// "editor finished loading" gate. `exact` keeps it off the dialog's own
		// "Export MP4" / "Export GIF" button.
		const openExport = editorWindow.getByRole("button", { name: "Export", exact: true });
		await expect(openExport).toBeEnabled({ timeout: 30_000 });
		await openExport.click();

		const dialog = editorWindow.getByRole("dialog");
		await expect(dialog.getByRole("heading", { name: "Export" })).toBeVisible();

		await dialog
			.getByRole("button", { name: format === "gif" ? "GIF" : "MP4", exact: true })
			.click();

		const startExport = dialog.getByRole("button", {
			name: format === "gif" ? "Export GIF" : "Export MP4",
			exact: true,
		});
		await expect(startExport).toBeEnabled();
		await startExport.click();

		if (cancelThenRetry) {
			const previousOutput = fs.readFileSync(outputPath);
			// Progress proves the actual native encoder has produced frames.
			await expect(dialog.getByText(/^[1-9]\d?%$/)).toBeVisible({ timeout: 30_000 });
			await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
			await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
			// KNOWN FLAKY on this hardware, and NOT fixed by the generosity below. Two
			// distinct symptoms have been observed while the CPU-bound GIF encode runs:
			// this click failing its 30s actionability window, and the dialog never
			// returning to an exportable state within 15s after a click that did land.
			// Both point at a starved renderer rather than at the cancel itself, so the
			// wait is left long enough to tell "slow to unwind" apart from "never".
			await expect(startExport).toBeEnabled({ timeout: 180_000 });
			await expect(dialog).toBeVisible();
			expect(fs.readFileSync(outputPath)).toEqual(previousOutput);
			expect(
				fs.readdirSync(appTmpDir).filter((name) => name.startsWith(".openscreen-gif-")),
			).toEqual([]);
			await expect(dialog.getByText("Saved to")).not.toBeVisible();
			await startExport.click();
		}

		// The dialog swaps the placeholder for a progress block while the native
		// exporter runs and finally reports the path it wrote to. The wait is
		// generous on purpose: the encoder is chosen at runtime (QSV/AMF/NVENC are
		// probed and discarded in turn), so a software fallback on this hardware can
		// legitimately take minutes for a frame walk that is instant with a GPU.
		await expect(dialog.getByText("Saved to")).toBeVisible({ timeout: 480_000 });
		await expect(dialog.getByText(outputPath)).toBeVisible();

		expect(fs.existsSync(outputPath), `${format.toUpperCase()} not found at ${outputPath}`).toBe(
			true,
		);
		expect(fs.statSync(outputPath).size).toBeGreaterThan(1024);
		// Runs against the file the encoder wrote, before the cleanup below removes it.
		validate?.(outputPath);
		return fs.readFileSync(outputPath);
	} catch (error) {
		const editor = app.windows().find((window) => window.url().includes("windowType=editor"));
		if (editor) {
			await editor
				.screenshot({ path: test.info().outputPath("export-failure.png") })
				.catch(() => undefined);
			console.error(
				"Export dialog at failure:",
				await editor
					.getByRole("dialog")
					.textContent({ timeout: 1_000 })
					.catch(() => "unavailable"),
			);
		}
		throw error;
	} finally {
		await closeApp(app);
		if (fs.existsSync(outputPath)) {
			removeQuietly(outputPath);
		}
		removeQuietly(userDataDir);
		removeQuietly(appTmpDir);
	}
}

// The container signature only proves a file was written; "playable" is the
// acceptance criterion. The output is decoded end to end instead — every frame of
// the first video stream read back, which is a stronger claim than reading headers
// with ffprobe, and needs only one binary, so it can run off the app's own bundled
// shared FFmpeg in CI where ffprobe is not guaranteed to exist.
test("exports a playable MP4 from a loaded video", async () => {
	const exported = await exportFromLoadedVideo("mp4", false, (outputPath) => {
		// `-map 0:v:0` fails the command outright when no video stream exists, so this
		// cannot pass on a file that merely has a valid header and nothing in it.
		execFileSync(
			process.env["OPENSCREEN_TEST_FFMPEG"] ?? "ffmpeg",
			["-v", "error", "-i", outputPath, "-map", "0:v:0", "-f", "null", "-"],
			{ stdio: "pipe", timeout: 120_000 },
		);
	});

	expect(exported.subarray(4, 8).toString("ascii")).toBe("ftyp");
});

test("exports a GIF from a loaded video", async () => {
	const exported = await exportFromLoadedVideo("gif");

	expect(exported.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a/);
});

test("cancels a running native GIF, preserves an existing file, and retries successfully", async () => {
	// Two full GIF encodes (each ~2-3 min on this hardware) plus the cancel unwind,
	// so the 180s default would cut the run off mid-export and report the wrong thing.
	test.setTimeout(570_000);
	const exported = await exportFromLoadedVideo("gif", true);
	expect(exported.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a/);
});
