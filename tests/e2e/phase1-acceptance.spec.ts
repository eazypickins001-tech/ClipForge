// Phase 1 acceptance, driven through the real app rather than the browser shim:
// import a recording, trim it on the timeline, then close the app and reopen it
// and check the trim came back.
//
// The reopen is the save proof: the shell loads the first project it finds on
// mount (`listProjects` → `loadProject` in NewEditorShell), and every assertion
// after the restart is made through the UI. `window.__osProjectStore` is NOT used
// — it is exposed only under `import.meta.env.DEV` and is tree-shaken out of the
// packaged build this suite targets.
//
// The project file IS read, but only to wait for durability (see
// `savedClipStartSec`): Apply queues the write, so tearing the app down the moment
// the dialog closes races the save and the reopen can legitimately find nothing.
//
// Needs a built app: `dist-electron/main.js`, or set CLIPFORGE_APP_EXE to a
// packaged win-unpacked/ClipForge.exe (the artifact's tree) to run the shipped
// build.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
	closeApp,
	launchApp,
	openEditorWindow,
	openEditorWithRecording,
	TEST_VIDEO,
} from "./harness";

// The "Edit clip" rail button. With a single clip it opens the modal directly;
// past one clip it opens a picker instead, which this suite does not cover.
async function openEditClipDialog(editor: Page) {
	await editor.getByRole("button", { name: "Edit clip", exact: true }).click();
	const dialog = editor.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Edit clip" })).toBeVisible();
	return dialog;
}

// The editor imports whichever recording it is handed on mount, so a clip pill
// appearing is the signal that the import finished.
async function expectSingleClip(editor: Page) {
	await expect(editor.locator("[data-clip-id]")).toHaveCount(1, { timeout: 60_000 });
}

// The trimmed in-point as it stands in the saved project, or null when there is
// nothing readable yet. Used only to wait for durability — never asserted against:
// the claim this test makes is the one read back through the UI after the reopen.
function savedClipStartSec(projectsDir: string): number | null {
	let names: string[];
	try {
		names = fs.readdirSync(projectsDir);
	} catch {
		return null;
	}
	for (const name of names) {
		if (!name.endsWith(".openscreen")) continue;
		try {
			const doc = JSON.parse(fs.readFileSync(path.join(projectsDir, name), "utf8")) as {
				timeline?: { clips?: Array<{ sourceStartSec?: number }> };
			};
			const start = doc.timeline?.clips?.[0]?.sourceStartSec;
			if (typeof start === "number") return start;
		} catch {
			// Writes are renamed into place, but a read can still catch a partial file.
		}
	}
	return null;
}

test("a trimmed clip is still trimmed after the app is closed and reopened", async () => {
	test.setTimeout(600_000);

	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-acceptance-user-"));
	const appTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-acceptance-tmp-"));

	// ---- session 1: import the recording, trim the head, apply ----
	const app1 = await launchApp(userDataDir, appTmpDir);
	let trimmedRange: string | null = null;
	try {
		const recordingsDir = path.join(
			await app1.evaluate(({ app }) => app.getPath("userData")),
			"recordings",
		);
		fs.mkdirSync(recordingsDir, { recursive: true });
		const recordingPath = path.join(recordingsDir, "acceptance-sample.webm");
		fs.copyFileSync(TEST_VIDEO, recordingPath);

		const editor = await openEditorWithRecording(app1, recordingPath);
		await expectSingleClip(editor);

		const dialog = await openEditClipDialog(editor);
		const beforeRange = await dialog.getByTestId("edit-clip-trim-range").textContent();

		// Drag the start grip a quarter of the way along the track. `startDrag`
		// computes deltaSec as dx / trackWidth * sourceDuration, so this moves the
		// in-point by ~0.5s of the two-second fixture.
		const track = dialog.getByTestId("edit-clip-trim-track");
		const grip = dialog.getByRole("button", { name: "Adjust clip start" });
		// The raw mouse API does no actionability checking, so an element sitting below
		// the fold would be handed coordinates outside the window and the drag would land
		// on nothing. This passed on a desktop and failed on a CI runner for exactly that
		// reason, so scroll it into view first and measure after.
		await grip.scrollIntoViewIfNeeded();
		const trackBox = await track.boundingBox();
		const gripBox = await grip.boundingBox();
		expect(trackBox, "trim track has no bounding box").not.toBeNull();
		expect(gripBox, "start grip has no bounding box").not.toBeNull();
		if (!trackBox || !gripBox) throw new Error("trim controls are not measurable");
		// A collapsed track would silently turn the drag below into a no-op.
		expect(trackBox.width, "trim track has no width to drag across").toBeGreaterThan(50);

		const gripCentre = {
			x: gripBox.x + gripBox.width / 2,
			y: gripBox.y + gripBox.height / 2,
		};
		await editor.mouse.move(gripCentre.x, gripCentre.y);
		await editor.mouse.down();
		await editor.mouse.move(gripCentre.x + trackBox.width * 0.25, gripCentre.y, { steps: 12 });
		await editor.mouse.up();

		trimmedRange = await dialog.getByTestId("edit-clip-trim-range").textContent();
		expect(trimmedRange, "dragging the start grip changed nothing").not.toBe(beforeRange);

		const apply = dialog.getByRole("button", { name: "Apply", exact: true });
		await expect(apply).toBeEnabled();
		await apply.click();
		await expect(dialog).toBeHidden();

		// Apply only queues the write, and this is the step that would otherwise let
		// the test pass for the wrong reason: closing now races the save, and the
		// reopen then finds an untouched clip that looks like a lost edit.
		await expect
			.poll(() => savedClipStartSec(path.join(userDataDir, "projects")), {
				message: "the trimmed in-point never reached the saved project",
				timeout: 60_000,
			})
			.toBeGreaterThan(0.1);
	} finally {
		await closeApp(app1);
	}

	expect(trimmedRange, "session 1 never trimmed the clip").not.toBeNull();

	// ---- session 2: reopen. No recording is seeded this time, so the project can
	// only come back from what session 1 saved. ----
	const app2 = await launchApp(userDataDir, appTmpDir);
	try {
		const editor = await openEditorWindow(app2);
		await expectSingleClip(editor);

		const dialog = await openEditClipDialog(editor);
		// The dialog's stat line is initialised from the clip's own source range, so
		// it reports what was persisted, not what the drag left in the component.
		expect(await dialog.getByTestId("edit-clip-trim-range").textContent()).toBe(
			trimmedRange as string,
		);
	} finally {
		await closeApp(app2);
	}
});
