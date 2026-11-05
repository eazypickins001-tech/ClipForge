// One dropdown hanging off the editor top bar: a trigger, and rows that close the menu and then act.
//
// Shared by the Clip and the Transcript menus so the two cannot drift in the parts that are not
// their content — the popover's Escape and outside-click behaviour, the row styling, and the
// `aria-expanded` that drops the bar out of the window-drag region while the menu is open (that is
// what lets a click on the empty bar close it; see `.topbar:has([aria-expanded="true"])`).
//
// A row is a label and a callback, nothing else: every menu so far is a flat list, and inventing an
// item model for nesting before a second level exists would be guessing.

import type { ReactNode } from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import styles from "../NewEditorShell.module.css";
import topbarStyles from "./EditorShellV4.module.css";

export interface TopBarMenuRow {
	/** Stable per menu: becomes the row's `data-testid` suffix, and its React key. */
	id: string;
	label: string;
	/** Shown but not clickable — the reason belongs in the label, which is what the caller has. */
	disabled?: boolean;
	onSelect: () => void;
}

export function TopBarMenu({
	label,
	icon,
	rows,
	testId,
}: {
	/** The trigger's text AND its accessible name. `aria-label` is set explicitly because the icon
	 *  is decorative and the text may be a single short word that a role query would otherwise have
	 *  to disambiguate by subtring. */
	label: string;
	icon: ReactNode;
	rows: readonly TopBarMenuRow[];
	/** Prefix for the trigger and row test ids (`<testId>`, `<testId>-row-<rowId>`). */
	testId: string;
}) {
	const [open, setOpen] = useState(false);

	// A click closes the menu first: the dialog a row opens should not have this popover still
	// standing over it. (A disabled row cannot be clicked at all, so no guard is needed here.)
	const run = (action: () => void) => () => {
		setOpen(false);
		action();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={topbarStyles.ghostBtn}
					aria-label={label}
					// See the header: this attribute is the whole no-drag contract while open.
					aria-expanded={open}
					data-testid={testId}
				>
					{icon}
					{label}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				collisionPadding={12}
				animated={false}
				className="w-auto border-0 bg-transparent p-0 shadow-none"
			>
				<div className={styles.actionMenu} role="menu" aria-label={label}>
					{rows.map((row) => (
						<button
							key={row.id}
							type="button"
							role="menuitem"
							className={styles.actionMenuRow}
							disabled={row.disabled}
							data-testid={`${testId}-row-${row.id}`}
							onClick={run(row.onSelect)}
						>
							<span className={styles.actionMenuMain}>{row.label}</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
