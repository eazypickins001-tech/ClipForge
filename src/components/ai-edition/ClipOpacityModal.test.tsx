// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import type { AxcutClip } from "@/lib/ai-edition/schema";
import { ClipOpacityModal } from "./ClipOpacityModal";

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

function renderPanel(
	target: AxcutClip | null,
	playheadSec = 1,
	onChange = vi.fn(),
	onSeek = vi.fn(),
) {
	const tree = (at: number) => (
		<I18nProvider>
			<ClipOpacityModal
				open
				onClose={vi.fn()}
				clip={target}
				playheadSec={at}
				speedRegions={[]}
				onChange={onChange}
				onSeek={onSeek}
			/>
		</I18nProvider>
	);
	const utils = render(tree(playheadSec));
	return {
		onChange,
		onSeek,
		movePlayhead: (at: number) => utils.rerender(tree(at)),
	};
}

describe("ClipOpacityModal", () => {
	it("keeps earlier captures while the panel stays open", () => {
		const { onChange, movePlayhead } = renderPanel(clip(), 1);

		fireEvent.click(screen.getByTestId("clip-opacity-add"));
		expect(onChange).toHaveBeenLastCalledWith([{ at: 0.1, value: 1 }]);

		// A whole-list write: the second capture must build on the first, not replace it with a
		// one-key list read from the snapshot taken when the panel opened.
		movePlayhead(5);
		fireEvent.click(screen.getByTestId("clip-opacity-add"));
		expect(onChange).toHaveBeenLastCalledWith([
			{ at: 0.1, value: 1 },
			{ at: 0.5, value: 1 },
		]);
	});

	it("removes one key and clears the track", () => {
		const { onChange } = renderPanel(clip(), 1);
		fireEvent.click(screen.getByTestId("clip-opacity-add"));

		fireEvent.click(screen.getAllByRole("button", { name: "Remove keyframe" })[0]);
		expect(onChange).toHaveBeenLastCalledWith([]);

		fireEvent.click(screen.getByTestId("clip-opacity-add"));
		fireEvent.click(screen.getByTestId("clip-opacity-clear"));
		expect(onChange).toHaveBeenLastCalledWith([]);
	});

	it("shows a hint instead of capturing when the playhead is outside the clip", () => {
		const { onChange } = renderPanel(clip(), 12);
		const add = screen.getByTestId("clip-opacity-add");
		expect(add).toBeDisabled();
		fireEvent.click(add);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("moves a key and jumps to it through the source clock", () => {
		const onChange = vi.fn();
		const onSeek = vi.fn();
		renderPanel(clip(), 1, onChange, onSeek);
		fireEvent.click(screen.getByTestId("clip-opacity-add"));

		const position = screen.getByLabelText("Key position (%)");
		fireEvent.change(position, { target: { value: "50" } });
		fireEvent.blur(position);
		expect(onChange).toHaveBeenLastCalledWith([{ at: 0.5, value: 1 }]);

		fireEvent.click(screen.getByRole("button", { name: "Go to key" }));
		expect(onSeek).toHaveBeenCalledWith(5);
	});

	it("renders nothing without a clip", () => {
		renderPanel(null);
		expect(screen.queryByTestId("clip-opacity-add")).toBeNull();
	});
});
