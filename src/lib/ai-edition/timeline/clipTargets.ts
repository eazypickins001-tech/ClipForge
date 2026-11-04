// The "which clip does this action mean" rules, shared so the inspector rail and the top bar's
// Clip menu cannot drift apart. Both resolve at CLICK time from the playhead rather than from a
// subscription: subscribing a control to the playhead would re-render it on every frame of
// playback, which is the cost the shell goes out of its way to avoid (see the rail's Split button,
// which reports a miss on click for the same reason).

import type { AxcutClip } from "@/lib/ai-edition/schema";

/** The clip the playhead sits INSIDE, or null in a gap or past either end. */
export function clipAtPlayhead(clips: AxcutClip[], playheadSec: number): AxcutClip | null {
	return (
		clips.find(
			(clip) => playheadSec > clip.timelineStartSec && playheadSec < clip.timelineEndSec,
		) ?? null
	);
}

/**
 * The clip whose LEFT EDGE is the boundary a transition belongs on — the clip the dip is stored
 * against (`transitionSchema.clipId` is the clip that FOLLOWS the cut).
 *
 * The playhead's own clip wins when it has a left edge; at the programme start there is none, so
 * the boundary just after it is the one meant. Null when there is no boundary at all, which is
 * also when the caller should leave its control disabled.
 */
export function transitionTargetClip(clips: AxcutClip[], playheadSec: number): AxcutClip | null {
	if (clips.length < 2) return null;
	const index = clips.findIndex(
		(clip) => playheadSec > clip.timelineStartSec && playheadSec < clip.timelineEndSec,
	);
	// Inside a clip that has a left edge: that edge is the boundary the user is nearest.
	if (index > 0) return clips[index];
	// Inside the FIRST clip: its own edge is the programme start, so the cut it precedes wins.
	if (index === 0) return clips[1];
	// The playhead is in a gap or past the end: the first boundary after it, else the last one.
	return (
		clips.find((clip, i) => i > 0 && clip.timelineStartSec >= playheadSec) ??
		clips[clips.length - 1]
	);
}
