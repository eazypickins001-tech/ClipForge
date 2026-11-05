// The editor top bar's Transcript menu: the speech-driven actions, which until now lived only on the
// transcript pane's toolbar — a surface you have to already know about, behind an icon in the rail.
//
// Why a menu and not more buttons: the pane's toolbar is contextual (it only appears with a
// transcript in the document), so after a transcription the actions exist but nothing in the chrome
// says so. Here every speech action is named, in one place, next to the Clip menu — and the rows
// keep their counts, so "Remove filler words (3)" still says what a click would do.
//
// Every row REUSES the key of the thing it opens or the pane's own label, so the menu adds no copy
// beyond its trigger and its "show me" row. Enablement is by COUNT, never by playhead, for the same
// reason the Clip menu's is: the counts are already computed for the pane and a subscription to the
// playhead would re-render the bar every frame of playback.

import { FileText } from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { TopBarMenu } from "./TopBarMenu";

export interface TranscriptMenuActions {
	/** The transcript pane can be revealed (there is a project to reveal it for). */
	canShowTranscript: boolean;
	showTranscript: () => void;
	transcribe: () => void;
	canTranscribe: boolean;
	isTranscribing: boolean;
	/** Cut every hesitation the shared plan accepts. Disabled at zero: no promise of a no-op. */
	removeFillers: () => void;
	fillerWordCount: number;
	/** Cut every pause past the threshold. Same contract. */
	removeSilences: () => void;
	silenceCutCount: number;
}

export function TranscriptMenu({ actions }: { actions: TranscriptMenuActions }) {
	const te = useScopedT("editor");
	const ts = useScopedT("settings");

	return (
		<TopBarMenu
			testId="transcript-menu"
			label={te("topbar.transcriptMenu")}
			icon={<FileText size={15} />}
			rows={[
				{
					id: "show",
					label: te("topbar.showTranscript"),
					disabled: !actions.canShowTranscript,
					onSelect: actions.showTranscript,
				},
				{
					id: "transcribe",
					label: ts("transcript.transcribeNow"),
					disabled: !actions.canTranscribe || actions.isTranscribing,
					onSelect: actions.transcribe,
				},
				{
					id: "fillers",
					label: ts("transcript.removeFillers", { count: actions.fillerWordCount }),
					disabled: actions.fillerWordCount === 0,
					onSelect: actions.removeFillers,
				},
				{
					id: "silences",
					label: ts("transcript.removeSilences", { count: actions.silenceCutCount }),
					disabled: actions.silenceCutCount === 0,
					onSelect: actions.removeSilences,
				},
			]}
		/>
	);
}
