// @vitest-environment jsdom
// The in-app Help menu: every topic opens the same modal, the sidebar switches topics, and the
// modal is reachable without a project (it lives in the top bar in every mode).

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { HelpMenu } from "./HelpMenu";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("HelpMenu", () => {
	it("opens a topic from the menu and switches to another in the modal", async () => {
		localStorage.setItem(LOCALE_STORAGE_KEY, "en");
		render(
			<I18nProvider>
				<HelpMenu />
			</I18nProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Help" }));
		const menu = await screen.findByRole("menu", { name: "Help" });
		fireEvent.click(within(menu).getByRole("menuitem", { name: "Getting started" }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent("How to use ClipForge");
		expect(screen.getByTestId("help-body-start")).toHaveTextContent("Open a project");

		fireEvent.click(screen.getByTestId("help-topic-export"));
		expect(screen.getByTestId("help-body-export")).toHaveTextContent("Export opens the dialog");

		fireEvent.click(screen.getByTestId("help-close"));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
