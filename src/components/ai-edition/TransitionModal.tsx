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

/** One tile per FAMILY, not per kind. The two directional families are stored as one kind per
 *  direction (`wipe-from-left`), but twelve tiles would mean twelve labels in fifteen languages for
 *  four words; a family tile plus a direction row reuses `settings.anchors`, already translated
 *  everywhere.
 *
 *  The two families: the DIPs need no overlap between the two clips, the BLENDs do — so the two
 *  clips overlap and the programme gets shorter by the transition's duration. Only the Windows
 *  compositor draws a blend today; elsewhere the kind is accepted and the boundary stays a hard cut,
 *  the same half-port the dip family has. */
const TILES = ["dip-black", "dip-white", "dip-color", "dissolve", "wipe", "slide"] as const;

type Tile = (typeof TILES)[number];
type Edge = "left" | "right" | "top" | "bottom";

const EDGES: Edge[] = ["left", "right", "top", "bottom"];

/** Which tile a stored kind belongs to: `wipe-from-top` is the `wipe` family. */
function tileOf(kind: AxcutTransition["kind"]): Tile | null {
	if (kind.startsWith("wipe-from-")) return "wipe";
	if (kind.startsWith("slide-from-")) return "slide";
	return (TILES as readonly string[]).includes(kind) ? (kind as Tile) : null;
}

/** The edge a stored kind arrives from. Meaningless — and unused — for the non-directional kinds. */
function edgeOf(kind: AxcutTransition["kind"]): Edge {
	return EDGES.find((edge) => kind.endsWith(`-${edge}`)) ?? "left";
}

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

	// Explicit keys rather than one built from the tile name: the catalogue is typed, and a template
	// key would typecheck as a plain string and drift silently.
	const LABELS: Record<Tile, string> = {
		"dip-black": t("transition.dipBlack"),
		"dip-white": t("transition.dipWhite"),
		"dip-color": t("transition.dipColor"),
		dissolve: t("transition.dissolve"),
		wipe: t("transition.wipe"),
		slide: t("transition.slide"),
	};
	const EDGE_LABELS: Record<Edge, string> = {
		left: t("anchors.left"),
		right: t("anchors.right"),
		top: t("anchors.top"),
		bottom: t("anchors.bottom"),
	};
	const active = tileOf(kind);
	const edge = edgeOf(kind);
	// The stored kind for a tile: a family keeps the direction the panel is already showing, so
	// switching Wipe -> Slide slides from the same edge rather than silently resetting it.
	const kindFor = (tile: Tile): AxcutTransition["kind"] =>
		tile === "wipe" ? `wipe-from-${edge}` : tile === "slide" ? `slide-from-${edge}` : tile;

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
				{TILES.map((tile) => (
					<button
						key={tile}
						type="button"
						aria-pressed={active === tile}
						data-testid={`transition-kind-${tile}`}
						onClick={() => onChange({ kind: kindFor(tile), durationMs, color })}
					>
						{LABELS[tile]}
					</button>
				))}
			</div>

			{active === "wipe" || active === "slide" ? (
				<div
					role="group"
					aria-label={t("transition.from")}
					style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}
				>
					<span>{t("transition.from")}</span>
					{EDGES.map((candidate) => (
						<button
							key={candidate}
							type="button"
							aria-pressed={edge === candidate}
							data-testid={`transition-edge-${candidate}`}
							onClick={() => onChange({ kind: `${active}-from-${candidate}`, durationMs, color })}
						>
							{EDGE_LABELS[candidate]}
						</button>
					))}
				</div>
			) : null}

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
