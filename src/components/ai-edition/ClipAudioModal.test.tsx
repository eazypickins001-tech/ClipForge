// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import type { AxcutClip } from "@/lib/ai-edition/schema";
import { ClipAudioModal } from "./ClipAudioModal";

function clip(overrides: Partial<AxcutClip> = {}): AxcutClip {
	return {
		id: "clip_1",
		assetId: "asset_1",
		sourceStartSec: 0,
		sourceEndSec: 10,
		timelineStartSec: 0,
		timelineEndSec: 10,
		wordRefs: [],
		origin: "user",
		reason: "",
		...overrides,
	} as AxcutClip;
}

function renderPanel(target: AxcutClip | null, onChange = vi.fn(), onSeek = vi.fn()) {
	render(
		<I18nProvider>
			<ClipAudioModal
				open
				onClose={vi.fn()}
				clip={target}
				playheadSec={0}
				onChange={onChange}
				onSeek={onSeek}
			/>
		</I18nProvider>,
	);
	return { onChange, onSeek };
}

describe("ClipAudioModal", () => {
	it("puts mute ON the volume control, the way CapCut does", () => {
		const { onChange } = renderPanel(clip());

		// A toggle that reports its state rather than a label that swaps between Mute and
		// Unmute: the target under the cursor must not change identity on the click.
		const mute = screen.getByTestId("clip-audio-mute");
		expect(mute).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(mute);
		expect(onChange).toHaveBeenCalledWith({ muted: true });
	});

	it("shows an already-muted clip as pressed", () => {
		renderPanel(clip({ muted: true }));
		expect(screen.getByTestId("clip-audio-mute")).toHaveAttribute("aria-pressed", "true");
	});

	it("writes the clip's level from the volume slider, on release", () => {
		const { onChange } = renderPanel(clip());
		const volume = screen.getByRole("slider", { name: "Output level" });

		fireEvent.change(volume, { target: { value: "-12" } });
		// Nothing is written mid-drag: a sweep is one write and one undo step.
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.mouseUp(volume);
		expect(onChange).toHaveBeenCalledWith({ gainDb: -12 });
	});

	it("writes each fade on release", () => {
		const { onChange } = renderPanel(clip());
		const fadeIn = screen.getByRole("slider", { name: "Fade in" });
		fireEvent.change(fadeIn, { target: { value: "800" } });
		fireEvent.mouseUp(fadeIn);
		expect(onChange).toHaveBeenCalledWith({ fadeInMs: 800 });

		const fadeOut = screen.getByRole("slider", { name: "Fade out" });
		fireEvent.change(fadeOut, { target: { value: "400" } });
		fireEvent.mouseUp(fadeOut);
		expect(onChange).toHaveBeenCalledWith({ fadeOutMs: 400 });
	});

	it("shows the clip's stored values", () => {
		renderPanel(clip({ gainDb: -6, fadeInMs: 250, fadeOutMs: 500 }));

		expect(screen.getByRole("slider", { name: "Output level" })).toHaveValue("-6");
		expect(screen.getByRole("slider", { name: "Fade in" })).toHaveValue("250");
		expect(screen.getByRole("slider", { name: "Fade out" })).toHaveValue("500");
	});

	it("captures a volume key at the playhead, as a whole-list write", () => {
		const { onChange } = renderPanel(clip());
		fireEvent.click(screen.getByTestId("clip-volume-add"));
		expect(onChange).toHaveBeenLastCalledWith({ volumeKeys: [{ at: 0, value: 1 }] });
	});

	it("changes a volume key's easing without touching its value", () => {
		const { onChange } = renderPanel(clip({ volumeKeys: [{ at: 0, value: 0.5 }] }));
		fireEvent.change(screen.getByRole("combobox", { name: "Easing" }), {
			target: { value: "ease-in" },
		});
		expect(onChange).toHaveBeenLastCalledWith({
			volumeKeys: [{ at: 0, value: 0.5, easing: "ease-in" }],
		});
	});

	it("writes a custom bezier when the menu asks for one", () => {
		const { onChange } = renderPanel(clip({ volumeKeys: [{ at: 0, value: 0.5 }] }));
		fireEvent.change(screen.getByRole("combobox", { name: "Easing" }), {
			target: { value: "custom" },
		});
		expect(onChange).toHaveBeenLastCalledWith({
			volumeKeys: [{ at: 0, value: 0.5, easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } }],
		});
	});

	it("moves a key by its position and jumps the playhead to it", () => {
		const onChange = vi.fn();
		const onSeek = vi.fn();
		renderPanel(clip({ volumeKeys: [{ at: 0.5, value: 0.4 }] }), onChange, onSeek);

		const position = screen.getByLabelText("Key position (%)");
		fireEvent.change(position, { target: { value: "80" } });
		fireEvent.blur(position);
		expect(onChange).toHaveBeenLastCalledWith({
			volumeKeys: [{ at: 0.8, value: 0.4 }],
		});

		fireEvent.click(screen.getByRole("button", { name: "Go to key" }));
		expect(onSeek).toHaveBeenCalledWith(8);
	});

	it("renders nothing without a clip", () => {
		renderPanel(null);
		expect(screen.queryByTestId("clip-audio-mute")).toBeNull();
	});
});
