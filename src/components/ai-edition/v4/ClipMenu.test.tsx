// @vitest-environment jsdom
// The editor top bar's Clip menu: the clip actions that used to be reachable only from the
// inspector rail's icon column (or a clip's right-click menu).
//
// Driven through the real top bar and the real English catalog, so the row labels prove the keys
// each row reuses — the dialog titles and the rail's own labels — still resolve. Nothing here
// asserts a key string the way a mocked translator would.

import "@testing-library/jest-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/contexts/I18nContext";
import { ShortcutsProvider } from "@/contexts/ShortcutsContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { ClipMenuActions } from "./ClipMenu";
import { EditorTopBar } from "./EditorTopBar";

const noop = () => undefined;

function makeActions(over: Partial<ClipMenuActions> = {}): ClipMenuActions {
	return {
		hasClips: true,
		hasBoundary: true,
		split: vi.fn(),
		detectScenes: vi.fn(),
		thumbnailStudio: vi.fn(),
		extractAudio: vi.fn(),
		openClipAudio: vi.fn(),
		openTransition: vi.fn(),
		endFade: vi.fn(),
		openEditClip: vi.fn(),
		...over,
	};
}

/** The bar exactly as the shell mounts it, with the Presets/catalog stack around it. */
function renderBar(clipActions?: ClipMenuActions) {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	return render(
		<I18nProvider>
			<ShortcutsProvider>
				<TooltipProvider>
					<EditorTopBar
						mode="edit"
						onModeChange={noop}
						projectTitle="Project"
						dirty={false}
						canExport={false}
						canUndo={false}
						canRedo={false}
						chatOpen={false}
						actions={{
							openProject: noop,
							newProject: noop,
							save: noop,
							export: noop,
							openSettings: noop,
							renameProject: noop,
							toggleChat: noop,
							openProviderSettings: noop,
							showAbout: noop,
							checkForUpdates: noop,
							undo: noop,
							redo: noop,
						}}
						{...(clipActions ? { clipActions } : {})}
					/>
				</TooltipProvider>
			</ShortcutsProvider>
		</I18nProvider>,
	);
}

async function openMenu() {
	fireEvent.click(screen.getByRole("button", { name: "Clip" }));
	return screen.findByRole("menu", { name: "Clip" });
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("Clip menu in the editor top bar", () => {
	it("lists the clip actions, each named for what it opens", async () => {
		renderBar(makeActions());
		const menu = await openMenu();
		const rows = within(menu).getAllByRole("menuitem");
		expect(rows.map((row) => row.textContent)).toEqual([
			"Split",
			"Detect scenes",
			"Thumbnail Studio",
			"Extract audio",
			"Audio",
			"Transition",
			"Fade out ending",
			"Edit clip",
		]);
	});

	it("runs the row's action once and closes the menu", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Split" }));

		expect(actions.split).toHaveBeenCalledTimes(1);
		// The dialog a row opens should not have the popover still standing over it.
		await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
	});

	it("runs scene detection from its row", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Detect scenes" }));

		expect(actions.detectScenes).toHaveBeenCalledTimes(1);
	});

	it("opens Thumbnail Studio from its row", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Thumbnail Studio" }));

		expect(actions.thumbnailStudio).toHaveBeenCalledTimes(1);
	});

	it("opens the transition sheet from its row", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Transition" }));

		expect(actions.openTransition).toHaveBeenCalledTimes(1);
	});

	it("opens the programme-end fade from its row", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Fade out ending" }));

		expect(actions.endFade).toHaveBeenCalledTimes(1);
	});

	it("disables every row when there is no clip to act on", async () => {
		renderBar(makeActions({ hasClips: false, hasBoundary: false }));
		const menu = await openMenu();
		for (const row of within(menu).getAllByRole("menuitem")) {
			expect(row).toBeDisabled();
		}
	});

	it("leaves Transition disabled until a boundary exists", async () => {
		renderBar(makeActions({ hasClips: true, hasBoundary: false }));
		const menu = await openMenu();
		// One clip is enough for Split and its siblings, but a boundary needs two.
		expect(within(menu).getByRole("menuitem", { name: "Split" })).toBeEnabled();
		expect(within(menu).getByRole("menuitem", { name: "Transition" })).toBeDisabled();
	});

	it("renders no Clip menu when the bar has no clip actions", () => {
		renderBar();
		expect(screen.queryByRole("button", { name: "Clip" })).not.toBeInTheDocument();
	});
});

// The bar doubles as the window titlebar, so while a menu hangs off it the whole bar has to stop
// being a drag region or a press on the empty bar never reaches the page to close the menu (#1009).
// The wordmark and Presets menus already rely on this rule; the Clip menu must too.
describe("Clip menu and the bar's drag region", () => {
	const css = readFileSync(path.join(__dirname, "EditorShellV4.module.css"), "utf8");
	const [, condition = ""] = css.match(/\n\.topbar(:has\([^{]*\))\s*\{/) ?? [];

	it("puts the bar under the no-drag rule while it is open", async () => {
		renderBar(makeActions());
		const bar = screen.getByRole("button", { name: "Clip" }).closest("header") as HTMLElement;
		expect(bar.matches(condition)).toBe(false);
		await openMenu();
		expect(bar.matches(condition)).toBe(true);
	});
});
