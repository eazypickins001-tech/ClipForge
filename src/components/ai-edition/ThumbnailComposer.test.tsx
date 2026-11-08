// @vitest-environment jsdom
// The 1280x720 composition editor: it paints the settings onto a canvas and exports the pixels as
// PNG/JPEG. jsdom has no canvas, so the context and toDataURL are stubbed; the wiring (attributes,
// export format, edit callback) is what this pins.

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { DEFAULT_THUMBNAIL_COMPOSITION } from "@/lib/ai-edition/thumbnailStudio";
import { ThumbnailComposer } from "./ThumbnailComposer";

const context = {
	clearRect: vi.fn(),
	fillRect: vi.fn(),
	drawImage: vi.fn(),
	measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
	fillText: vi.fn(),
	strokeText: vi.fn(),
	fillStyle: "",
	strokeStyle: "",
	lineWidth: 0,
	font: "",
	textAlign: "left",
	textBaseline: "alphabetic",
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

beforeEach(() => {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	originalGetContext = HTMLCanvasElement.prototype.getContext;
	originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
	HTMLCanvasElement.prototype.getContext = vi.fn(() => context) as never;
	HTMLCanvasElement.prototype.toDataURL = vi.fn((type: string) =>
		type === "image/jpeg" ? "data:image/jpeg;base64,BBBB" : "data:image/png;base64,AAAA",
	) as never;
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	HTMLCanvasElement.prototype.getContext = originalGetContext;
	HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
});

function renderComposer(onExport = vi.fn(), onChange = vi.fn()) {
	render(
		<I18nProvider>
			<ThumbnailComposer
				backgroundDataUrl={null}
				value={DEFAULT_THUMBNAIL_COMPOSITION}
				onChange={onChange}
				onExport={onExport}
			/>
		</I18nProvider>,
	);
	return { onExport, onChange };
}

describe("ThumbnailComposer", () => {
	it("is a 1280x720 canvas and exports PNG and JPEG", () => {
		const { onExport } = renderComposer();
		const canvas = screen.getByTestId("studio-canvas");
		expect(canvas).toHaveAttribute("width", "1280");
		expect(canvas).toHaveAttribute("height", "720");

		fireEvent.click(screen.getByTestId("composer-export-png"));
		expect(onExport).toHaveBeenCalledWith("data:image/png;base64,AAAA", "png");
		fireEvent.click(screen.getByTestId("composer-export-jpeg"));
		expect(onExport).toHaveBeenCalledWith("data:image/jpeg;base64,BBBB", "jpeg");
	});

	it("hands an edited headline back to the composition", () => {
		const { onChange } = renderComposer();
		fireEvent.change(screen.getByTestId("studio-headline"), {
			target: { value: "A better demo" },
		});
		expect(onChange).toHaveBeenCalledWith({
			...DEFAULT_THUMBNAIL_COMPOSITION,
			headline: "A better demo",
		});
	});
});
