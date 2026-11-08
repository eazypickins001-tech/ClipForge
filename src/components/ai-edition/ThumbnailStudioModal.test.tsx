// @vitest-environment jsdom
// The Thumbnail Studio panel: generate locally, edit a prompt, copy it, save the composition as one
// project write. Nothing here reaches a provider or an image.

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { StoredThumbnailStudio } from "@/lib/ai-edition/thumbnailStudio";
import { ThumbnailStudioModal } from "./ThumbnailStudioModal";

const copyToClipboard = vi.fn();

function setup(saved: StoredThumbnailStudio | null = null) {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	copyToClipboard.mockReset();
	copyToClipboard.mockResolvedValue(undefined);
	(window as unknown as { electronAPI: unknown }).electronAPI = { copyToClipboard };
	const onSave = vi.fn().mockResolvedValue(true);
	const onClose = vi.fn();
	render(
		<I18nProvider>
			<ThumbnailStudioModal
				open
				onClose={onClose}
				projectTitle="Record Better Demos"
				transcriptText="First open the recorder, then pick the window."
				saved={saved}
				onSave={onSave}
			/>
		</I18nProvider>,
	);
	return { onSave, onClose };
}

afterEach(() => {
	cleanup();
	localStorage.clear();
	delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe("ThumbnailStudioModal", () => {
	it("generates three concepts and the publishing copy from the inputs", () => {
		setup();
		fireEvent.change(screen.getByLabelText("Brief"), {
			target: { value: "Show a clean demo without a second monitor." },
		});
		fireEvent.click(screen.getByTestId("studio-generate"));

		expect(screen.getAllByTestId(/studio-prompt-/)).toHaveLength(3);
		expect(screen.getByTestId("studio-publishing-title")).toHaveValue("Record Better Demos");
		expect((screen.getByTestId("studio-publishing-body") as HTMLTextAreaElement).value).toContain(
			"Show a clean demo",
		);
		expect(
			(screen.getByTestId("studio-publishing-tags") as HTMLInputElement).value.length,
		).toBeGreaterThan(0);
	});

	it("copies the edited prompt through the preload bridge", async () => {
		setup();
		fireEvent.click(screen.getByTestId("studio-generate"));
		fireEvent.change(screen.getByTestId("studio-prompt-0"), {
			target: { value: "my edited prompt" },
		});

		fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);

		await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith("my edited prompt"));
	});

	it("saves the whole composition in one call and reports it saved", async () => {
		const { onSave } = setup();
		fireEvent.change(screen.getByLabelText("Brief"), {
			target: { value: "A brief" },
		});
		fireEvent.click(screen.getByTestId("studio-generate"));
		fireEvent.change(screen.getByTestId("studio-prompt-1"), {
			target: { value: "the second prompt" },
		});

		fireEvent.click(screen.getByTestId("studio-save"));

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		const payload = onSave.mock.calls[0]?.[0] as {
			inputs: { title: string; brief: string };
			result: { concepts: Array<{ prompt: string }> };
		};
		expect(payload.inputs).toMatchObject({ title: "Record Better Demos", brief: "A brief" });
		expect(payload.result.concepts[1].prompt).toBe("the second prompt");
		expect(await screen.findByText("Saved to project")).toBeInTheDocument();
	});

	it("opens on the saved composition when the project has one", () => {
		const inputs = {
			title: "Saved title",
			brief: "Saved brief",
			audience: "",
			platform: "youtube" as const,
			brand: "",
			exclusions: "",
		};
		setup({
			inputs,
			result: {
				concepts: [
					{
						id: "curiosity",
						hook: "H",
						composition: "C",
						focalPoint: "F",
						palette: [],
						thumbnailText: "T",
						prompt: "saved prompt 1",
						rationale: "R",
						evidence: "title",
					},
					{
						id: "benefit",
						hook: "H",
						composition: "C",
						focalPoint: "F",
						palette: [],
						thumbnailText: "T",
						prompt: "saved prompt 2",
						rationale: "R",
						evidence: "title",
					},
					{
						id: "contrast",
						hook: "H",
						composition: "C",
						focalPoint: "F",
						palette: [],
						thumbnailText: "T",
						prompt: "saved prompt 3",
						rationale: "R",
						evidence: "title",
					},
				],
				publishing: { title: "Saved title", body: "Saved body", tags: ["#one"], evidence: "title" },
				evidence: { basis: "title" },
			},
		});
		expect(screen.getByTestId("studio-title")).toHaveValue("Saved title");
		expect(screen.getByTestId("studio-prompt-0")).toHaveValue("saved prompt 1");
	});
});
