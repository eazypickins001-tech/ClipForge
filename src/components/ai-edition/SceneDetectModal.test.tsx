// @vitest-environment jsdom
// The scene-detection sheet: the pass's two knobs, live progress, and a Cancel that reaches the
// main process. The document edit is the shell's (`onApply`), so a sweep still saves once.

import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { SceneDetectModal } from "./SceneDetectModal";

const detectScenes = vi.fn();
const cancelSceneDetection = vi.fn();
const onSceneDetectProgress = vi.fn();
let emitProgress: ((fraction: number) => void) | null = null;

function setup(over: { onApply?: (...args: never[]) => Promise<number> } = {}) {
	localStorage.setItem(LOCALE_STORAGE_KEY, "en");
	detectScenes.mockReset();
	cancelSceneDetection.mockReset();
	onSceneDetectProgress.mockReset();
	emitProgress = null;
	cancelSceneDetection.mockResolvedValue(true);
	onSceneDetectProgress.mockImplementation((callback: (fraction: number) => void) => {
		emitProgress = callback;
		return () => {
			emitProgress = null;
		};
	});
	(window as unknown as { electronAPI: unknown }).electronAPI = {
		detectScenes,
		cancelSceneDetection,
		onSceneDetectProgress,
	};
	const onApply = over.onApply ?? vi.fn().mockResolvedValue(2);
	const onClose = vi.fn();
	render(
		<I18nProvider>
			<SceneDetectModal
				open
				clipId="clip_1"
				assetPath="/tmp/rec.mp4"
				durationSec={10}
				onApply={onApply}
				onClose={onClose}
			/>
		</I18nProvider>,
	);
	return { onApply, onClose };
}

afterEach(() => {
	cleanup();
	localStorage.clear();
	delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe("SceneDetectModal", () => {
	it("runs the pass with the panel's two values and applies the cuts", async () => {
		const { onApply, onClose } = setup();
		detectScenes.mockResolvedValue({ success: true, cutsSec: [2, 6] });

		fireEvent.change(screen.getByLabelText("Sensitivity"), { target: { value: "0.2" } });
		fireEvent.click(screen.getByTestId("scene-detect-start"));

		await waitFor(() => expect(onApply).toHaveBeenCalledWith("clip_1", [2, 6]));
		expect(detectScenes).toHaveBeenCalledWith("/tmp/rec.mp4", {
			threshold: 0.2,
			minSceneSec: 0.5,
			durationSec: 10,
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("shows the decode's progress while it runs", async () => {
		const { onApply } = setup();
		let resolve!: (value: { success: boolean; cutsSec: number[] }) => void;
		detectScenes.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);

		fireEvent.click(screen.getByTestId("scene-detect-start"));
		await waitFor(() => expect(emitProgress).not.toBeNull());
		act(() => emitProgress?.(0.5));
		expect(screen.getByTestId("scene-detect-progress")).toHaveAttribute("aria-valuenow", "50");

		resolve({ success: true, cutsSec: [3] });
		await waitFor(() => expect(onApply).toHaveBeenCalledWith("clip_1", [3]));
	});

	it("cancels the decode and never applies a late reply", async () => {
		const { onApply, onClose } = setup();
		let resolve!: (value: { success: boolean; cutsSec: number[] }) => void;
		detectScenes.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);

		fireEvent.click(screen.getByTestId("scene-detect-start"));
		fireEvent.click(await screen.findByTestId("scene-detect-cancel"));

		expect(cancelSceneDetection).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
		resolve({ success: true, cutsSec: [3] });
		await Promise.resolve();
		expect(onApply).not.toHaveBeenCalled();
	});

	it("says there were no cut points instead of applying an empty sweep", async () => {
		const { onApply } = setup();
		detectScenes.mockResolvedValue({ success: true, cutsSec: [] });

		fireEvent.click(screen.getByTestId("scene-detect-start"));

		expect(await screen.findByRole("alert")).toHaveTextContent("No scene changes found");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("names a missing FFmpeg as the reason, not as a clean scan", async () => {
		setup();
		detectScenes.mockResolvedValue({ success: false, cutsSec: [], reason: "no-ffmpeg" });

		fireEvent.click(screen.getByTestId("scene-detect-start"));

		expect(await screen.findByRole("alert")).toHaveTextContent("Scene detection is unavailable");
	});
});
