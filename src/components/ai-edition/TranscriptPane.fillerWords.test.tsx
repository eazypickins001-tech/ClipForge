// @vitest-environment jsdom
// The transcript pane's one-click rough cut — the BUTTON only.
//
// What can be cut is `planWordCuts`' question and is tested beside it; what is tested here is that
// the pane offers the action with the number the shell actually computed, hands the click over,
// and offers nothing at all when there is not a word to cut. The count is passed in rather than
// derived here on purpose: the pane has no document to plan against.

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import type { AxcutAsset, AxcutClip, AxcutTranscript } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { TranscriptPane } from "./RightPanes";

vi.mock("@/native", () => ({ nativeBridgeClient: { aiEdition: {} } }));
vi.mock("@/native/client", () => ({ nativeBridgeClient: { aiEdition: {} } }));
vi.mock("@/lib/ai-edition/store/useEditorSettings", () => ({
	useEditorSettings: () => ({ settings: {}, set: vi.fn(), hasDocument: true }),
}));

const ASSETS = [
	{
		id: "asset_1",
		kind: "video",
		label: "recording.mp4",
		originalPath: "/rec.mp4",
		durationSec: 12,
		cameraTrack: null,
	},
] as unknown as AxcutAsset[];

const CLIPS = [
	{
		id: "clip_1",
		assetId: "asset_1",
		sourceStartSec: 0,
		sourceEndSec: 12,
		timelineStartSec: 0,
		timelineEndSec: 12,
		wordRefs: [],
		origin: "user",
		reason: "",
	},
] as unknown as AxcutClip[];

const TRANSCRIPTS = [
	{
		assetId: "asset_1",
		language: "en",
		sourceDslPath: "t.dsl",
		sourceJsonPath: "t.json",
		segments: [
			{
				id: "seg_1",
				kind: "speech",
				startSec: 0,
				endSec: 2,
				text: "um hello",
				wordIds: ["w0", "w1"],
			},
		],
		words: [
			{ id: "w0", segmentId: "seg_1", startSec: 0, endSec: 0.4, text: "um" },
			{ id: "w1", segmentId: "seg_1", startSec: 1, endSec: 1.6, text: "hello" },
		],
	},
] as unknown as AxcutTranscript[];

function mount(fillerWordCount: number) {
	useProjectStore.setState({
		projectId: "proj_1",
		document: {
			schemaVersion: 9,
			project: {
				id: "proj_1",
				title: "T",
				createdAt: "2026-06-25T10:00:00.000Z",
				updatedAt: "2026-06-25T10:00:00.000Z",
				primaryAssetId: "asset_1",
			},
			assets: ASSETS,
			transcript: null,
			transcripts: TRANSCRIPTS,
			timeline: {
				clips: CLIPS,
				gaps: [],
				trimRanges: [],
				muteRanges: [],
				speedRanges: [],
				captionRanges: [],
			},
			annotations: [],
			zoomRanges: [],
			audioTracks: [],
			legacyEditor: null,
			// biome-ignore lint/suspicious/noExplicitAny: fixture, not a schema exercise
		} as any,
		status: "ready",
		error: null,
		dirty: false,
	});

	const onRemoveFillerWords = vi.fn();
	render(
		<I18nProvider>
			<TranscriptPane
				clips={CLIPS}
				audioTracks={[]}
				transcripts={TRANSCRIPTS}
				assets={ASSETS}
				trimRanges={[]}
				busyAssetIds={[]}
				onSeek={vi.fn()}
				onTrimTimelineSpan={vi.fn()}
				onRemoveTrimRanges={vi.fn()}
				onSetWordText={vi.fn()}
				onInsertWord={vi.fn()}
				onRemoveWords={vi.fn()}
				onRemoveFillerWords={onRemoveFillerWords}
				fillerWordCount={fillerWordCount}
				onTranscribe={vi.fn()}
				canTranscribe
				isTranscribing={false}
			/>
		</I18nProvider>,
	);
	return { onRemoveFillerWords };
}

afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
});

describe("remove filler words", () => {
	it("offers the sweep, labelled with the number of words it would cut", () => {
		const { onRemoveFillerWords } = mount(3);
		const button = screen.getByTestId("remove-filler-words");
		// The count rides inside the label rather than beside it, so every locale places it.
		expect(button).toHaveTextContent("Remove filler words (3)");

		fireEvent.click(button);
		expect(onRemoveFillerWords).toHaveBeenCalledTimes(1);
	});

	it("offers nothing when there is not a word to cut", () => {
		mount(0);
		expect(screen.queryByTestId("remove-filler-words")).not.toBeInTheDocument();
	});
});
