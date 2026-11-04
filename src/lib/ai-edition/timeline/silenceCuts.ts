// Long pauses, as cuts.
//
// There is no silence IN the transcript to read: the transcriber feeds Silero-VAD-trimmed audio to
// whisper and maps every word back onto the original clock, so the transcript holds speech and
// nothing else. (`transcriptSchema` allows `kind: "silence"`, but nothing in the app writes one —
// see the `ponytail:` note in `aggregated-transcript.ts`.) So a pause is DERIVED: the gap between
// one word's end and the next word's start.
//
// Only INTERIOR pauses are cut. Leading and trailing dead air would mean moving the clip's in/out
// point — a different edit, changing what the clip IS rather than cutting a hole in it — and that
// is a separate decision this deliberately does not make.
//
// The spans handed back are shaped and written by `applyWordCutRuns`, so a silence cut gets the
// same treatment a filler cut does: `breatheCut` leaves a little room either side of the spoken
// words, and `mergeCloseCuts` keeps it from flashing a frame against a cut already there.

import type { CutRun } from "../document/wordCuts";
import { clipsOwningSpan, documentTranscripts } from "../document/wordCuts";
import type { AxcutDocument } from "../schema";
import { isGeneratedAssetId } from "./clip-parts";
import { trimAppliesToClip } from "./trim-mapping";

/**
 * How long a pause has to be before removing it reads as an edit rather than as tidying.
 *
 * Ordinary speech leaves 100–200 ms between words, and cutting THOSE is what makes a "silence
 * removal" sound chopped. Past roughly half a second the gap is dead air the speaker would not miss.
 */
export const MIN_SILENCE_SEC = 0.6;

/**
 * Every pause worth cutting, as spans on the clip that owns them.
 *
 * Skips, rather than fails, everything the timeline cannot accept — a gap no single clip fully
 * contains, or one an existing cut already covers — because this is a bulk action over a whole
 * transcript and one unusable gap must not stop the rest.
 */
export function findSilenceCuts(
	document: AxcutDocument,
	minSilenceSec: number = MIN_SILENCE_SEC,
): CutRun[] {
	const cuts: CutRun[] = [];
	for (const transcript of documentTranscripts(document)) {
		const asset = document.assets.find((candidate) => candidate.id === transcript.assetId);
		if (!asset || isGeneratedAssetId(transcript.assetId)) continue;

		// Spoken words only, in time order: `transcript.words` is in transcript order, which is not
		// guaranteed to be chronological once edits have been made.
		const words = transcript.words
			.filter(
				(word) =>
					word.source !== "synth" &&
					Number.isFinite(word.startSec) &&
					Number.isFinite(word.endSec) &&
					word.endSec > word.startSec,
			)
			.sort((a, b) => a.startSec - b.startSec);

		for (let i = 0; i + 1 < words.length; i += 1) {
			const startSec = words[i].endSec;
			const endSec = words[i + 1].startSec;
			if (endSec - startSec < minSilenceSec) continue;

			const clips = clipsOwningSpan(
				document.timeline.clips,
				transcript.assetId,
				asset.durationSec,
				startSec,
				endSec,
			);
			if (clips.length !== 1) continue;
			const clip = clips[0];
			const alreadyCut = document.timeline.trimRanges.some(
				(trim) => trimAppliesToClip(trim, clip) && startSec < trim.endSec && endSec > trim.startSec,
			);
			if (alreadyCut) continue;

			cuts.push({ assetId: transcript.assetId, clipId: clip.id, startSec, endSec });
		}
	}
	return cuts;
}
