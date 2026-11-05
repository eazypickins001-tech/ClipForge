// How much programme time a BLEND transition eats — the arithmetic a cross-dissolve adds to the
// timeline, kept pure and separate so it can be pinned before anything consumes it.
//
// A dip needs none of this: one clip is on screen and its own frame ramps through a colour, which is
// why the dip family is modelled inside the clip (`clipVideoDips`). A dissolve needs the outgoing and
// incoming pictures at the SAME output instant, and with the clips contiguous that instant belongs to
// one of them. So the two clips overlap by `d` and the programme gets `d` shorter — CapCut's model.
//
// Deliberately knows nothing about clips or trims: the caller passes the KEPT lengths it has already
// computed, so this file stays a function of numbers and cannot disagree with the programme builder
// about what a trim removed.

/** The transition kinds where both pictures move at once, and the programme therefore shortens.
 *
 *  All of them are the same pass — the outgoing picture drawn over the finished incoming one — with
 *  different geometry: a cross fade for `dissolve`, an advancing edge for the `wipe-from-*`, and a
 *  translation for the `slide-from-*`. The suffix names the EDGE the incoming picture arrives from,
 *  which is what makes `wipe-from-left` unambiguous: the new picture is revealed starting at the
 *  left edge and the boundary sweeps rightwards. */
export const BLEND_KINDS = [
	"dissolve",
	"wipe-from-left",
	"wipe-from-right",
	"wipe-from-top",
	"wipe-from-bottom",
	"slide-from-left",
	"slide-from-right",
	"slide-from-top",
	"slide-from-bottom",
] as const;

export type BlendKind = (typeof BLEND_KINDS)[number];

/** Whether a transition kind needs the overlap. A dip does not. */
export function isBlendKind(kind: string | undefined): kind is BlendKind {
	return kind !== undefined && (BLEND_KINDS as readonly string[]).includes(kind);
}

/**
 * Programme seconds the boundary BEFORE a clip takes, or 0 when that boundary is not a blend.
 *
 * Three clamps, each for a reason:
 *
 *  - **Half the shorter neighbour.** The overlap holds material from both clips at once, so each
 *    side pays `d`. Allowing more than half of either would let a long dissolve erase a whole clip.
 *  - **What the outgoing clip has left.** A dissolve on BOTH sides of one clip claims its head and
 *    its tail. Without this, two long dissolves around a short clip would double-book the same
 *    seconds and the programme would fold on itself.
 *  - **The duration itself**, obviously, and never a negative.
 */
export function blendOverlapSec(input: {
	kind: string | undefined;
	durationMs: number | undefined;
	/** Kept (post-trim) seconds of the clip ending at this boundary. */
	outgoingKeptSec: number;
	/** Kept seconds of the clip starting at this boundary. */
	incomingKeptSec: number;
	/** Overlap already taken off the OUTGOING clip's head by the boundary before it. */
	alreadyConsumedSec: number;
}): number {
	if (!isBlendKind(input.kind)) return 0;
	const wanted = (input.durationMs ?? 0) / 1000;
	if (!(wanted > 0)) return 0;
	const half = Math.min(input.outgoingKeptSec, input.incomingKeptSec) / 2;
	const left = Math.max(0, input.outgoingKeptSec - input.alreadyConsumedSec);
	return Math.max(0, Math.min(wanted, half, left));
}
