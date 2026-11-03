// Split and Extract audio, driven through the real app: the two clip edits that were
// unit-tested but never exercised end to end.
//
// Both asserts are made against the SAVED PROJECT, not the UI state: `window.__osProjectStore`
// is exposed only under `import.meta.env.DEV` and is tree-shaken out of the packaged build this
// suite targets, and the store is what the next launch reads back. The poll-before-teardown is
// the durability step from phase1-acceptance: the write is queued, so closing the app the moment
// the click lands races the save and the spec would read a document that never got written.
//
// Both edits resolve their target the same way: the SELECTION wins, otherwise whatever sits under
// the playhead. Both also start by CLEARING the selection, so selecting a pill does not help — what
// they need is a playhead inside the clip, and the import leaves it at 0. `seekIntoClip` below is
// therefore the whole setup, and it is why the split spec passed while the extract one, which
// clicked a pill instead, got nothing back.
//
// This x is only inside the clip because the import fits a single 2s take to the view; if the clip
// ever stops filling the ruler, the click lands outside it, the edit refuses, and the poll says so
// rather than passing.
//
// Needs a built app: `dist-electron/main.js`, or set CLIPFORGE_APP_EXE to a packaged
// win-unpacked/ClipForge.exe (the artifact's tree) to run the shipped build.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { closeApp, FIXTURES_DIR, launchApp, openEditorWithRecording, TEST_VIDEO } from "./harness";

// `TEST_VIDEO` (sample.webm) carries no audio stream: extracting from it can produce nothing, and
// the first CI run of this spec found that the hard way ("No decodable audio ... does not contain
// any stream"). The speech fixture is the one with a real AAC track, so it is the one to extract.
const SPEECH_VIDEO = path.join(FIXTURES_DIR, "speech-sample.mp4");

type SavedDocument = {
	timeline?: {
		clips?: Array<{ id?: string; muted?: boolean }>;
		muteRanges?: Array<{ startSec?: number; endSec?: number; reason?: string }>;
	};
	audioTracks?: Array<{ kind?: string; assetId?: string; clipId?: string }>;
};

/** The one project the app has saved, or null while nothing readable is on disk yet. */
function savedDocument(projectsDir: string): SavedDocument | null {
	let names: string[];
	try {
		names = fs.readdirSync(projectsDir);
	} catch {
		return null;
	}
	for (const name of names) {
		if (!name.endsWith(".openscreen")) continue;
		try {
			return JSON.parse(fs.readFileSync(path.join(projectsDir, name), "utf8")) as SavedDocument;
		} catch {
			// Writes are renamed into place, but a read can still catch a partial file.
		}
	}
	return null;
}

/** Puts the playhead inside the clip, which is the precondition both edits share. */
async function seekIntoClip(editor: Page) {
	// The ruler seeks on pointer down (`startScrub`), and the press lands on the ruler rather
	// than on a clip, which is the case that handler honours.
	const ruler = editor.locator('[class*="tlRulerRow"]').first();
	const box = await ruler.boundingBox();
	expect(box, "the timeline ruler has no bounding box").not.toBeNull();
	if (!box) throw new Error("the timeline ruler is not measurable");
	// A collapsed ruler would silently turn the click below into a no-op.
	expect(box.width, "the timeline ruler has no width to seek across").toBeGreaterThan(50);
	await editor.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function bootWithRecording(videoPath: string): Promise<{
	app: Awaited<ReturnType<typeof launchApp>>;
	editor: Page;
	userDataDir: string;
}> {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-edits-user-"));
	const appTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-edits-tmp-"));
	const app = await launchApp(userDataDir, appTmpDir);

	const recordingsDir = path.join(
		await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")),
		"recordings",
	);
	fs.mkdirSync(recordingsDir, { recursive: true });
	const recordingPath = path.join(recordingsDir, path.basename(videoPath));
	fs.copyFileSync(videoPath, recordingPath);

	const editor = await openEditorWithRecording(app, recordingPath);
	await expect(editor.locator("[data-clip-id]")).toHaveCount(1, { timeout: 60_000 });
	return { app, editor, userDataDir };
}

test("Split turns one clip into two", async () => {
	test.setTimeout(600_000);
	const { app, editor, userDataDir } = await bootWithRecording(TEST_VIDEO);
	try {
		await seekIntoClip(editor);
		await editor.getByRole("button", { name: "Split", exact: true }).click();

		await expect
			.poll(() => savedDocument(path.join(userDataDir, "projects"))?.timeline?.clips?.length, {
				message: "the split never reached the saved project (one clip, not two)",
				timeout: 60_000,
			})
			.toBe(2);

		// In the UI too, not only on disk: the pill the user sees is one per clip.
		await expect(editor.locator("[data-clip-id]")).toHaveCount(2);
	} finally {
		await closeApp(app);
	}
});

test("Extract audio moves the sound to its own track and silences the clip", async () => {
	test.setTimeout(600_000);
	const { app, editor, userDataDir } = await bootWithRecording(SPEECH_VIDEO);
	try {
		await seekIntoClip(editor);
		await editor.getByRole("button", { name: "Extract audio", exact: true }).click();

		const projectsDir = path.join(userDataDir, "projects");
		await expect
			.poll(() => savedDocument(projectsDir)?.audioTracks?.length, {
				message: "the extracted track never reached the saved project",
				timeout: 60_000,
			})
			.toBe(1);

		const doc = savedDocument(projectsDir);
		// Named for where it came from: the take's own voice, not a voiceover.
		expect(doc?.audioTracks?.[0]?.kind).toBe("extracted");
		// Anchored to the clip it came out of, so the two stay together.
		expect(doc?.audioTracks?.[0]?.clipId).toBe(doc?.timeline?.clips?.[0]?.id);
		// And the clip itself is silenced, or the sound would play twice. This used to be a mute
		// range, which nothing read: the take kept playing under the track it had been moved to.
		expect(doc?.timeline?.clips?.[0]?.muted).toBe(true);
		expect(doc?.timeline?.muteRanges).toEqual([]);
	} finally {
		await closeApp(app);
	}
});
