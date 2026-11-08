// @vitest-environment jsdom
// The programme-end sheet is the same dialog with a narrower vocabulary: a cut can carry a dip or
// a blend, but the end has no incoming picture, so only the dip family makes sense there.

import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { TransitionModal } from "./TransitionModal";

function renderModal(side: "in" | "out") {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	render(
		<I18nProvider>
			<TransitionModal
				open
				onClose={vi.fn()}
				side={side}
				transition={null}
				onChange={vi.fn()}
				onRemove={vi.fn()}
			/>
		</I18nProvider>,
	);
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("TransitionModal side", () => {
	it("offers only the dip family at the programme end", () => {
		renderModal("out");
		expect(screen.getByTestId("transition-kind-dip-black")).toBeInTheDocument();
		expect(screen.getByTestId("transition-kind-dip-white")).toBeInTheDocument();
		expect(screen.queryByTestId("transition-kind-dissolve")).not.toBeInTheDocument();
	});

	it("offers the blend families at a cut", () => {
		renderModal("in");
		expect(screen.getByTestId("transition-kind-dissolve")).toBeInTheDocument();
	});
});
