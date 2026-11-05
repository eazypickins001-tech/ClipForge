// @vitest-environment jsdom
// The editor top bar's Transcript menu: the speech actions, which until now were only on the
// transcript pane's toolbar — a surface you had to already know about.
//
// Driven through the real top bar and the real English catalog, so the labels prove the reused keys
// still resolve, exactly as the Clip menu's test does.

import "@testing-library/jest-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/contexts/I18nContext";
import { ShortcutsProvider } from "@/contexts/ShortcutsContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { EditorTopBar } from "./EditorTopBar";
import type { TranscriptMenuActions } from "./TranscriptMenu";

const noop = () => undefined;

function makeActions(over: Partial<TranscriptMenuActions> = {}): TranscriptMenuActions {
	return {
		canShowTranscript: true,
		showTranscript: vi.fn(),
		transcribe: vi.fn(),
		canTranscribe: true,
		isTranscribing: false,
		removeFillers: vi.fn(),
		fillerWordCount: 3,
		removeSilences: vi.fn(),
		silenceCutCount: 2,
		...over,
	};
}

function renderBar(transcriptActions?: TranscriptMenuActions) {
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
						{...(transcriptActions ? { transcriptActions } : {})}
					/>
				</TooltipProvider>
			</ShortcutsProvider>
		</I18nProvider>,
	);
}

async function openMenu() {
	fireEvent.click(screen.getByTestId("transcript-menu"));
	return screen.findByRole("menu", { name: "Transcript" });
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("Transcript menu in the editor top bar", () => {
	it("names every speech action, with the counts each one would apply", async () => {
		renderBar(makeActions());
		const menu = await openMenu();
		const rows = within(menu).getAllByRole("menuitem");
		expect(rows.map((row) => row.textContent)).toEqual([
			"Show transcript",
			"Transcribe now",
			"Remove filler words (3)",
			"Remove silences (2)",
		]);
	});

	it("runs the row's action once and closes the menu", async () => {
		const actions = makeActions();
		renderBar(actions);
		const menu = await openMenu();

		fireEvent.click(within(menu).getByRole("menuitem", { name: "Remove filler words (3)" }));

		expect(actions.removeFillers).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
	});

	it("disables a sweep with nothing to cut, rather than promising a no-op", async () => {
		renderBar(makeActions({ fillerWordCount: 0, silenceCutCount: 0 }));
		const menu = await openMenu();
		expect(within(menu).getByRole("menuitem", { name: /Remove filler words/ })).toBeDisabled();
		expect(within(menu).getByRole("menuitem", { name: /Remove silences/ })).toBeDisabled();
	});

	it("disables transcribe while a run is in flight", async () => {
		renderBar(makeActions({ isTranscribing: true }));
		const menu = await openMenu();
		expect(within(menu).getByRole("menuitem", { name: "Transcribe now" })).toBeDisabled();
	});

	it("renders no Transcript menu when the bar has no such actions", () => {
		renderBar();
		expect(screen.queryByTestId("transcript-menu")).not.toBeInTheDocument();
	});
});

// Same drag-region contract as the Clip menu: the bar must stop being a titlebar while open, or a
// click on the empty bar never reaches the page to close it (#1009).
describe("Transcript menu and the bar's drag region", () => {
	const css = readFileSync(path.join(__dirname, "EditorShellV4.module.css"), "utf8");
	const [, condition = ""] = css.match(/\n\.topbar(:has\([^{]*\))\s*\{/) ?? [];

	it("puts the bar under the no-drag rule while it is open", async () => {
		renderBar(makeActions());
		const bar = screen.getByTestId("transcript-menu").closest("header") as HTMLElement;
		expect(bar.matches(condition)).toBe(false);
		await openMenu();
		expect(bar.matches(condition)).toBe(true);
	});
});
