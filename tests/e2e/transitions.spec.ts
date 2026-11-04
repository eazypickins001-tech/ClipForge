// Boundary dips, driven through the real app: the junction button on the timeline, the transition
// sheet it opens, and the document the next launch reads back. The UI pieces the transitions work
// shipped (`4836e87`) that nothing else proves — a type-check alone says the props line up, not
// that a click writes a dip.
//
// Two ways in are exercised, because they are two entry points to the same sheet: the junction
// button on the seam, and the top bar's Clip menu (which reaches the same boundary through
// `transitionTargetClip`, resolved from the playhead).
//
// The assert is made against the SAVED PROJECT, not the UI state, for the reason clip-edits.spec.ts
// gives: `window.__osProjectStore` is exposed only under `import.meta.env.DEV` and is tree-shaken
// out of the packaged build this suite targets, and the saved document is what durability means.
// The write is queued, so the poll (never a bare read after the click) is the durability step — it
// lets the save land before the app closes.
//
// A dip is reachable only on a REAL cut. `joinContiguous` fuses two adjacent same-media,
// media-contiguous clips back into one unless either is `detached`, and `splitClip` marks its halves
// detached — so import → seek inside the clip → Split is the setup, exactly as clip-edits.spec.ts
// does for its own two-clip edit. The junction button then sits on that boundary and names the clip
// that FOLLOWS the cut (a dip is stored on the incoming clip's left edge).
//
// Needs a built app: `dist-electron/main.js`, or set CLIPFORGE_APP_EXE to a packaged
// win-unpacked/ClipForge.exe (the artifact's tree) to run the shipped build.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { closeApp, launchApp, openEditorWithRecording, TEST_VIDEO } from "./harness";

type SavedTransition = {
	id?: string;
	clipId?: string;
	side?: string;
	kind?: string;
	durationMs?: number;
	color?: string;
};

type SavedDocument = {
	timeline?: { clips?: Array<{ id?: string }> };
	transitions?: SavedTransition[];
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

/** Puts the playhead inside the clip, which the Split needs to find a target. */
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

/**
 * Boots the app with one recording, splits it into the two clips a boundary needs, and returns the
 * live junction button plus the id it targets. Waiting for the split on DISK (not only in the DOM)
 * is what makes the dip write the next save in the queue rather than a race against it.
 */
async function bootWithTwoClips(): Promise<{
	app: Awaited<ReturnType<typeof launchApp>>;
	editor: Page;
	projectsDir: string;
	junction: ReturnType<Page["locator"]>;
	clipId: string;
}> {
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-transitions-user-"));
	const appTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-transitions-tmp-"));
	const app = await launchApp(userDataDir, appTmpDir);

	const recordingsDir = path.join(
		await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")),
		"recordings",
	);
	fs.mkdirSync(recordingsDir, { recursive: true });
	const recordingPath = path.join(recordingsDir, path.basename(TEST_VIDEO));
	fs.copyFileSync(TEST_VIDEO, recordingPath);

	const editor = await openEditorWithRecording(app, recordingPath);
	await expect(editor.locator("[data-clip-id]")).toHaveCount(1, { timeout: 60_000 });

	await seekIntoClip(editor);
	await editor.getByRole("button", { name: "Split", exact: true }).click();

	const projectsDir = path.join(userDataDir, "projects");
	await expect
		.poll(() => savedDocument(projectsDir)?.timeline?.clips?.length, {
			message: "the split never reached the saved project (one clip, not two)",
			timeout: 60_000,
		})
		.toBe(2);

	// One boundary, one junction button, naming the clip after the cut.
	const junction = editor.locator("[data-transition-at]");
	await expect(junction).toHaveCount(1);
	const clipId = await junction.getAttribute("data-transition-at");
	expect(clipId, "the junction button carries no clip id").toBeTruthy();
	if (!clipId) throw new Error("the junction button is not targetable");
	return { app, editor, projectsDir, junction, clipId };
}

test("a dip placed at a junction reaches the saved project", async () => {
	test.setTimeout(600_000);
	const { app, editor, projectsDir, junction, clipId } = await bootWithTwoClips();
	try {
		await junction.click();

		// `dip-white`, not the default black: the assert below then proves the CHOICE propagated,
		// not merely that some row appeared.
		const white = editor.getByTestId("transition-kind-dip-white");
		await expect(white).toBeVisible();
		// The tile is the whole commit — one click, one write, one undo step.
		await white.click();

		await expect
			.poll(() => savedDocument(projectsDir)?.transitions?.[0]?.kind, {
				message: "the dip never reached the saved project",
				timeout: 60_000,
			})
			.toBe("dip-white");

		const dip = savedDocument(projectsDir)?.transitions?.[0];
		// Anchored to the clip that FOLLOWS the cut, on its left edge.
		expect(dip?.clipId).toBe(clipId);
		expect(dip?.side).toBe("in");
		// Nothing touched the slider, so the default duration stands.
		expect(dip?.durationMs).toBe(500);

		// The junction now advertises the dip it carries (the `◑` state, `aria-pressed`).
		await expect(junction).toHaveAttribute("aria-pressed", "true");
	} finally {
		await closeApp(app);
	}
});

test("removing a dip reaches the saved project", async () => {
	test.setTimeout(600_000);
	const { app, editor, projectsDir, junction } = await bootWithTwoClips();
	try {
		await junction.click();
		await editor.getByTestId("transition-kind-dip-black").click();

		await expect
			.poll(() => savedDocument(projectsDir)?.transitions?.length, {
				message: "the dip never reached the saved project",
				timeout: 60_000,
			})
			.toBe(1);

		// `Remove` only renders once a dip exists, so its presence is itself an assertion.
		await editor.getByTestId("transition-remove").click();

		await expect
			.poll(() => (savedDocument(projectsDir)?.transitions ?? []).length, {
				message: "the removal never reached the saved project",
				timeout: 60_000,
			})
			.toBe(0);

		// And the junction is a plain hard cut again.
		await expect(junction).toHaveAttribute("aria-pressed", "false");
	} finally {
		await closeApp(app);
	}
});

test("the Clip menu puts a dip on the boundary at the playhead", async () => {
	test.setTimeout(600_000);
	const { app, editor, projectsDir, junction, clipId } = await bootWithTwoClips();
	try {
		// The top bar's discoverable way in, for a boundary the playhead is already on.
		// `exact` matters: the wordmark's accessible name ("ClipForge") and the rail's "Edit clip"
		// both contain "Clip", so a substring match is ambiguous.
		await editor.getByRole("button", { name: "Clip", exact: true }).click();
		const menu = editor.getByRole("menu", { name: "Clip", exact: true });
		await expect(menu).toBeVisible();
		await menu.getByRole("menuitem", { name: "Transition", exact: true }).click();

		// The SAME sheet the junction button opens — one dialog, two entry points.
		const white = editor.getByTestId("transition-kind-dip-white");
		await expect(white).toBeVisible();
		await white.click();

		// Resolved from the playhead, the menu lands on the same boundary the junction button names.
		await expect
			.poll(() => savedDocument(projectsDir)?.transitions?.[0]?.clipId, {
				message: "the menu's dip never reached the saved project",
				timeout: 60_000,
			})
			.toBe(clipId);

		await expect(junction).toHaveAttribute("aria-pressed", "true");
	} finally {
		await closeApp(app);
	}
});
