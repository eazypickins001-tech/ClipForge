// The editor top bar's Clip menu: the clip-level actions that otherwise live only on the inspector
// rail (and, for Split and Extract audio, on a clip's right-click menu).
//
// The rail is a column of icons whose meaning is in a tooltip — fine once you know it, and exactly
// why nobody finds a feature. This menu is the named, discoverable home for the same actions. The
// transcript-scoped ones live in the Transcript menu beside it.
//
// Every row REUSES the key of the thing it opens — a dialog's own title, or the rail button's
// label — so no row can drift from what it opens, and the menu adds no copy beyond its own trigger.
//
// Enablement is by COUNT, never by playhead: the rows resolve their target at click time (see
// clipTargets), so subscribing to the playhead here would re-render the whole bar on every frame of
// playback to disable a row a moment early. A miss (playhead outside every clip) is reported on
// click, the same contract the rail's buttons use.
//
// The dropdown itself is `TopBarMenu` — shared with the Transcript menu, so the two cannot drift in
// their Escape/outside-click behaviour or in the attribute that keeps the bar from being dragged.

import { Clapperboard } from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import { TopBarMenu } from "./TopBarMenu";

export interface ClipMenuActions {
	/** At least one clip: the rows that resolve the playhead's clip are enabled. */
	hasClips: boolean;
	/** At least two clips: there is a boundary for a transition to sit on. */
	hasBoundary: boolean;
	split: () => void;
	detectScenes: () => void;
	thumbnailStudio: () => void;
	extractAudio: () => void;
	openClipAudio: () => void;
	openTransition: () => void;
	openEditClip: () => void;
}

export function ClipMenu({ actions }: { actions: ClipMenuActions }) {
	const te = useScopedT("editor");
	const ts = useScopedT("settings");

	return (
		<TopBarMenu
			testId="clip-menu"
			label={te("topbar.clipMenu")}
			icon={<Clapperboard size={15} />}
			rows={[
				{
					id: "split",
					label: te("inspector.splitClip"),
					disabled: !actions.hasClips,
					onSelect: actions.split,
				},
				{
					id: "detect-scenes",
					label: te("inspector.detectScenes"),
					disabled: !actions.hasClips,
					onSelect: actions.detectScenes,
				},
				{
					id: "thumbnail-studio",
					label: te("inspector.thumbnailStudio"),
					disabled: !actions.hasClips,
					onSelect: actions.thumbnailStudio,
				},
				{
					id: "extract-audio",
					label: te("inspector.extractAudio"),
					disabled: !actions.hasClips,
					onSelect: actions.extractAudio,
				},
				{
					id: "clip-audio",
					label: ts("audio.title"),
					disabled: !actions.hasClips,
					onSelect: actions.openClipAudio,
				},
				{
					id: "transition",
					label: ts("transition.title"),
					disabled: !actions.hasBoundary,
					onSelect: actions.openTransition,
				},
				{
					id: "edit-clip",
					label: te("editClipDialog.title"),
					disabled: !actions.hasClips,
					onSelect: actions.openEditClip,
				},
			]}
		/>
	);
}
