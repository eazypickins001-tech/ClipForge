// The editor top bar's Clip menu: the clip-level actions that otherwise live only on the inspector
// rail (and, for Split and Extract audio, on a clip's right-click menu).
//
// The rail is a column of icons whose meaning is in a tooltip — fine once you know it, and exactly
// why nobody finds a feature. This menu is the named, discoverable home for the same actions, and
// it is where the next per-clip features (remove filler words, scene detection → split) will land.
//
// Every row REUSES the key of the thing it opens — a dialog's own title, or the rail button's
// label — so no row can drift from what it opens, and the menu adds no copy beyond its own trigger.
//
// Enablement is by COUNT, never by playhead: the rows resolve their target at click time (see
// clipTargets), so subscribing to the playhead here would re-render the whole bar on every frame of
// playback to disable a row a moment early. A miss (playhead outside every clip) is reported on
// click, the same contract the rail's buttons use.

import { Clapperboard } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import styles from "../NewEditorShell.module.css";
import topbarStyles from "./EditorShellV4.module.css";

export interface ClipMenuActions {
	/** At least one clip: the rows that resolve the playhead's clip are enabled. */
	hasClips: boolean;
	/** At least two clips: there is a boundary for a transition to sit on. */
	hasBoundary: boolean;
	split: () => void;
	extractAudio: () => void;
	openClipAudio: () => void;
	openTransition: () => void;
	openEditClip: () => void;
}

export function ClipMenu({ actions }: { actions: ClipMenuActions }) {
	const te = useScopedT("editor");
	const ts = useScopedT("settings");
	const [open, setOpen] = useState(false);

	// A click closes the menu first: the dialog it opens should not have this popover still standing
	// over it. (A row that is disabled cannot be clicked at all, so no guard is needed here.)
	const run = (action: () => void) => () => {
		setOpen(false);
		action();
	};

	const row = (label: string, disabled: boolean, action: () => void) => (
		<button
			type="button"
			role="menuitem"
			className={styles.actionMenuRow}
			disabled={disabled}
			onClick={run(action)}
		>
			<span className={styles.actionMenuMain}>{label}</span>
		</button>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={topbarStyles.ghostBtn}
					aria-label={te("topbar.clipMenu")}
					// The bar stops being a titlebar while this is set — see the
					// `.topbar:has([aria-expanded="true"])` rule, which the wordmark and Presets menus
					// rely on for the same reason (#1009).
					aria-expanded={open}
				>
					<Clapperboard size={15} />
					{te("topbar.clipMenu")}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				collisionPadding={12}
				animated={false}
				className="w-auto border-0 bg-transparent p-0 shadow-none"
			>
				<div className={styles.actionMenu} role="menu" aria-label={te("topbar.clipMenu")}>
					{row(te("inspector.splitClip"), !actions.hasClips, actions.split)}
					{row(te("inspector.extractAudio"), !actions.hasClips, actions.extractAudio)}
					{row(ts("audio.title"), !actions.hasClips, actions.openClipAudio)}
					{row(ts("transition.title"), !actions.hasBoundary, actions.openTransition)}
					{row(te("editClipDialog.title"), !actions.hasClips, actions.openEditClip)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
