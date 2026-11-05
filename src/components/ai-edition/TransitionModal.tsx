// The dip between two clips — CapCut's transition sheet, reached from the junction button on the
// timeline.
//
// A dip belongs to a BOUNDARY, not to a clip, so this panel names the clip that FOLLOWS the cut and
// writes one row (`side: "in"`). Half the duration lands on each side: the outgoing clip fades down
// into the colour and the incoming one fades up out of it, which is why a single duration control
// covers both sides.
//
// Commit-on-release, like the clip audio panel: the slider holds a live value while the drag is in
// flight and writes once on release, so a sweep is one write and one undo step.
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { AxcutTransition } from "@/lib/ai-edition/schema";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

/** How long a dip may run. Past a couple of seconds it stops reading as a transition and starts
 *  reading as an edit of its own. */
export const TRANSITION_MIN_MS = 100;
export const TRANSITION_MAX_MS = 3000;

/** The whole dip the panel wants on a boundary. One shape for a first placement and for a change. */
export type TransitionSpec = {
	kind: AxcutTransition["kind"];
	durationMs: number;
	color?: string;
};

/** The two families: the DIPs need no overlap between the two clips, `dissolve` does — it is a
 *  BLEND, so the two clips overlap and the programme gets shorter by its duration. Only the Windows
 *  compositor draws a blend today; elsewhere the kind is accepted and the boundary stays a hard cut,
 *  the same half-port the dip family has. */
const KINDS: Array<AxcutTransition["kind"]> = ["dip-black", "dip-white", "dip-color", "dissolve"];

export function TransitionModal({
	open,
	onClose,
	transition,
	onChange,
	onRemove,
}: {
	open: boolean;
	onClose: () => void;
	/** The dip already on this clip's left edge, or null while the boundary is still a hard cut. */
	transition: AxcutTransition | null;
	onChange: (spec: TransitionSpec) => void;
	onRemove: () => void;
}) {
	const t = useScopedT("settings");
	const tc = useScopedT("common");
	const kind = transition?.kind ?? "dip-black";
	const durationMs = transition?.durationMs ?? 500;
	const color = transition?.color ?? "#000000";
	// Live-drag value; null means "show the committed one".
	const [liveDuration, setLiveDuration] = useState<number | null>(null);
	// The same guard the clip audio panel needs: a drag released outside the control never fires
	// its commit, so an uncommitted value must not follow the panel to the next junction.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the row's id is the trigger, not a read.
	useEffect(() => {
		setLiveDuration(null);
	}, [transition?.id]);

	const label = (k: AxcutTransition["kind"]) => {
		if (k === "dip-white") return t("transition.dipWhite");
		if (k === "dip-color") return t("transition.dipColor");
		if (k === "dissolve") return t("transition.dissolve");
		return t("transition.dipBlack");
	};

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title={t("transition.title")}
			footer={
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					{transition ? (
						<button type="button" onClick={onRemove} data-testid="transition-remove">
							{t("transition.remove")}
						</button>
					) : (
						<span />
					)}
					<button type="button" onClick={onClose} data-testid="transition-done">
						{tc("actions.close")}
					</button>
				</div>
			}
		>
			<div
				role="group"
				aria-label={t("transition.title")}
				style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
			>
				{KINDS.map((k) => (
					<button
						key={k}
						type="button"
						aria-pressed={kind === k}
						data-testid={`transition-kind-${k}`}
						onClick={() => onChange({ kind: k, durationMs, color })}
					>
						{label(k)}
					</button>
				))}
			</div>

			<div style={{ marginTop: 12 }}>
				<SliderCell
					label={t("transition.duration")}
					value={liveDuration ?? durationMs}
					min={TRANSITION_MIN_MS}
					max={TRANSITION_MAX_MS}
					step={50}
					decimals={0}
					suffix=" ms"
					onChange={setLiveDuration}
					onCommit={() => {
						if (liveDuration !== null) onChange({ kind, durationMs: liveDuration, color });
					}}
				/>
			</div>

			{kind === "dip-color" ? (
				<div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
					<span>{t("transition.color")}</span>
					<input
						type="color"
						aria-label={t("transition.color")}
						data-testid="transition-color"
						value={color}
						onChange={(e) => onChange({ kind, durationMs, color: e.target.value })}
					/>
				</div>
			) : null}
		</ModalShell>
	);
}
