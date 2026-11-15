// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import type { AxcutClip } from "@/lib/ai-edition/schema";
import { ClipTransformModal } from "./ClipTransformModal";

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

function renderPanel(target: AxcutClip, playheadSec = 1) {
	const onChange = vi.fn();
	const tree = (at: number) => (
		<I18nProvider>
			<ClipTransformModal
				open
				onClose={vi.fn()}
				clip={target}
				playheadSec={at}
				speedRegions={[]}
				onChange={onChange}
			/>
		</I18nProvider>
	);
	const utils = render(tree(playheadSec));
	return { onChange, movePlayhead: (at: number) => utils.rerender(tree(at)) };
}

describe("ClipTransformModal", () => {
	it("captures scale and position independently, at the source instant", () => {
		const { onChange } = renderPanel(clip(), 1);
		fireEvent.click(screen.getByTestId("transform-add-scale"));
		expect(onChange).toHaveBeenLastCalledWith("scale", [{ at: 0.1, value: 1 }]);
		fireEvent.click(screen.getByTestId("transform-add-x"));
		expect(onChange).toHaveBeenLastCalledWith("x", [{ at: 0.1, value: 0 }]);
	});

	it("keeps earlier captures while the panel stays open", () => {
		const { onChange, movePlayhead } = renderPanel(clip(), 1);
		fireEvent.click(screen.getByTestId("transform-add-scale"));
		movePlayhead(5);
		fireEvent.click(screen.getByTestId("transform-add-scale"));
		expect(onChange).toHaveBeenLastCalledWith("scale", [
			{ at: 0.1, value: 1 },
			{ at: 0.5, value: 1 },
		]);
	});
});
