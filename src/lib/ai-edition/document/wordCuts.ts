// Cutting spoken words, in two halves that different callers need separately.
//
//   planWordCuts  — WHICH words may be cut, and by which clip. Every rule a word has to pass.
//   applyWordCutRuns — the write: word runs shaped into trim ranges, all in one document.
//
// The split is deliberate. The agent's `removeWords` tool resolves words through the SAME plan (so
// the two can never disagree about what is cuttable), but applies them one run at a time, because
// each run reports the zoom transitions its cut removes and the tool's result carries those
// warnings per run. A bulk action over a whole transcript has no one to report to, so it shapes and
// writes every run at once — one document, which is one Ctrl+Z.
//
// Both compose the same primitives (`breatheCut` to leave the neighbouring words their room,
// `mergeCloseCuts` to avoid a one-frame flash beside an existing cut), so the two paths cut the
// media the same way even though they report differently.

import type { AxcutClip, AxcutDocument, AxcutTranscript } from "../schema";
import { isGeneratedAssetId } from "../timeline/clip-parts";
import { type BreathWord, breatheCut, mergeCloseCuts } from "../timeline/cut-breath";
import { trimAppliesToClip } from "../timeline/trim-mapping";

/** Why a word cannot be cut. A code, not a sentence: the caller owns its own wording. */
export type WordCutRejectionReason =
	/** No transcript in this document carries the id. */
	| "unknown"
	/** The id exists under more than one asset, so the caller must say which. */
	| "ambiguous"
	/** Here-say media: a generated asset, or a word the transcriber synthesised. */
	| "no-source"
	/** Missing, inverted or out-of-range timestamps. */
	| "bad-timestamps"
	/** No single placed clip owns the whole word. */
	| "not-in-one-clip"
	/** Already inside an existing trim. */
	| "already-cut";

export interface WordCutRejection {
	wordId: string;
	reason: WordCutRejectionReason;
	/** Only for `not-in-one-clip`: how many clips were found, which the agent's message names. */
	clipCount?: number;
}

/** A word that may be cut, resolved to the clip whose source holds it. */
export interface WordCutTarget {
	wordId: string;
	assetId: string;
	clipId: string;
	text: string;
	/** Place in its transcript's word list — what makes two targets "consecutive". */
	index: number;
	startSec: number;
	endSec: number;
}

/** A cut, as the write path needs it: a span on one clip. */
export interface CutRun {
	assetId: string;
	clipId: string;
	startSec: number;
	endSec: number;
}

/** One cut covering one or more consecutive words of one clip. */
export interface WordCutRun extends CutRun {
	wordIds: string[];
}

/** Every transcript the document holds, primary first, without duplicating the legacy single one. */
export function documentTranscripts(document: AxcutDocument): AxcutTranscript[] {
	const transcripts = [...document.transcripts];
	if (
		document.transcript &&
		!transcripts.some((transcript) => transcript.assetId === document.transcript?.assetId)
	) {
		transcripts.push(document.transcript);
	}
	return transcripts;
}

/**
 * The placed clips that fully own a source span — one of them means the span has a single owner and
 * a cut has somewhere to sit; none, or several, means it does not.
 *
 * An unprobed clip carries no `sourceEndSec`; it falls back to the asset's duration, which is the
 * window it will have once the real duration is known. Shared so a word cut and a silence cut
 * cannot answer "which clip is this in" differently.
 */
export function clipsOwningSpan(
	clips: readonly AxcutClip[],
	assetId: string,
	durationSec: number | undefined,
	startSec: number,
	endSec: number,
): AxcutClip[] {
	return clips.filter((clip) => {
		const clipEnd = clip.sourceEndSec ?? durationSec;
		return (
			clip.assetId === assetId &&
			clipEnd !== undefined &&
			Number.isFinite(clipEnd) &&
			startSec >= clip.sourceStartSec &&
			endSec <= clipEnd
		);
	});
}

/**
 * Resolve word ids to the clips that can cut them, and say why each one that cannot, cannot.
 *
 * Nothing is refused wholesale: a bulk caller is expected to skip the rejections and cut the rest,
 * while the agent's tool fails the whole request on the first one. `assetId` disambiguates ids that
 * repeat across transcripts — word ids restart per asset.
 */
export function planWordCuts(
	document: AxcutDocument,
	wordIds: readonly string[],
	assetId?: string,
): { targets: WordCutTarget[]; rejected: WordCutRejection[] } {
	const transcripts = documentTranscripts(document);
	const targets: WordCutTarget[] = [];
	const rejected: WordCutRejection[] = [];

	for (const wordId of wordIds) {
		const matches = transcripts
			.filter((transcript) => assetId === undefined || transcript.assetId === assetId)
			.flatMap((transcript) =>
				transcript.words.flatMap((word, index) =>
					word.id === wordId ? [{ assetId: transcript.assetId, word, index }] : [],
				),
			);
		if (matches.length !== 1) {
			rejected.push({ wordId, reason: matches.length === 0 ? "unknown" : "ambiguous" });
			continue;
		}
		const { assetId: wordAssetId, word, index } = matches[0];
		const asset = document.assets.find((candidate) => candidate.id === wordAssetId);
		if (!asset || isGeneratedAssetId(wordAssetId) || word.source === "synth") {
			rejected.push({ wordId, reason: "no-source" });
			continue;
		}
		const { startSec, endSec } = word;
		if (
			!Number.isFinite(startSec) ||
			!Number.isFinite(endSec) ||
			startSec < 0 ||
			endSec <= startSec ||
			(asset.durationSec !== undefined &&
				(!Number.isFinite(asset.durationSec) || endSec > asset.durationSec))
		) {
			rejected.push({ wordId, reason: "bad-timestamps" });
			continue;
		}
		// Exactly one clip has to own the whole word, or the cut has no single owner.
		const clips = clipsOwningSpan(
			document.timeline.clips,
			wordAssetId,
			asset.durationSec,
			startSec,
			endSec,
		);
		if (clips.length !== 1) {
			rejected.push({ wordId, reason: "not-in-one-clip", clipCount: clips.length });
			continue;
		}
		const clip = clips[0];
		if (
			document.timeline.trimRanges.some(
				(trim) => trimAppliesToClip(trim, clip) && startSec < trim.endSec && endSec > trim.startSec,
			)
		) {
			rejected.push({ wordId, reason: "already-cut" });
			continue;
		}
		targets.push({
			wordId,
			assetId: wordAssetId,
			clipId: clip.id,
			text: word.text,
			index,
			startSec,
			endSec,
		});
	}
	return { targets, rejected };
}

/**
 * Fold targets into the smallest set of cuts: words that follow one another in the transcript, on
 * one clip, go out as ONE cut. Cutting a phrase word by word would leave the gaps between its words
 * playing — the opposite of what "remove these words" means.
 */
export function groupWordCutRuns(targets: readonly WordCutTarget[]): WordCutRun[] {
	const ordered = [...targets].sort(
		(a, b) => a.assetId.localeCompare(b.assetId) || a.index - b.index,
	);
	const runs: WordCutRun[] = [];
	/** The transcript index of the word the last run ended on. */
	let lastIndex: number | null = null;
	for (const target of ordered) {
		const last = runs.at(-1);
		if (
			last &&
			lastIndex !== null &&
			last.assetId === target.assetId &&
			last.clipId === target.clipId &&
			lastIndex + 1 === target.index
		) {
			last.wordIds.push(target.wordId);
			last.endSec = target.endSec;
			lastIndex = target.index;
			continue;
		}
		runs.push({
			assetId: target.assetId,
			clipId: target.clipId,
			wordIds: [target.wordId],
			startSec: target.startSec,
			endSec: target.endSec,
		});
		lastIndex = target.index;
	}
	return runs;
}

/**
 * The trims a set of runs becomes, on the given document. Pure and exported for the tests: the
 * shaping is the part worth pinning.
 *
 * Applied in order, accumulating, so a later run sees the cuts already made as its neighbours —
 * the same sequence the agent's per-run path produces.
 */
export function wordCutRunsToTrims(
	document: AxcutDocument,
	runs: readonly CutRun[],
	reason: string,
	makeId: () => string,
): AxcutDocument["timeline"]["trimRanges"] {
	const trims = [...document.timeline.trimRanges];
	for (const run of runs) {
		const transcript = documentTranscripts(document).find(
			(candidate) => candidate.assetId === run.assetId,
		);
		const clip = document.timeline.clips.find((candidate) => candidate.id === run.clipId);
		const siblings = trims.filter((trim) =>
			trimAppliesToClip(trim, { id: run.clipId, assetId: run.assetId }),
		);
		// Which of this asset's words are still in the film: what `breatheCut` reads to know where
		// the gaps next to the cut are, and which side of the cut has a word to leave room for.
		const words: BreathWord[] = (transcript?.words ?? [])
			.filter((word) => word.source !== "synth")
			.map((word) => {
				const mid = (word.startSec + word.endSec) / 2;
				const inClip =
					!clip || (mid >= clip.sourceStartSec && mid < (clip.sourceEndSec ?? Infinity));
				const cut = siblings.some((trim) => mid >= trim.startSec && mid < trim.endSec);
				return { startSec: word.startSec, endSec: word.endSec, kept: inClip && !cut };
			});
		const shaped = mergeCloseCuts(
			breatheCut({ startSec: run.startSec, endSec: run.endSec }, words),
			siblings,
			document.assets.find((asset) => asset.id === run.assetId)?.video?.fps,
		);
		trims.push({
			id: makeId(),
			assetId: run.assetId,
			clipId: run.clipId,
			startSec: shaped.startSec,
			endSec: shaped.endSec,
			reason,
			origin: "user",
		});
	}
	return trims;
}

/**
 * The whole write: every run cut in ONE document, so a bulk action over a transcript is a single
 * undo step. A document with no runs comes back untouched — the caller can compare identity to
 * decide whether there is anything to save.
 */
export function applyWordCutRuns(
	document: AxcutDocument,
	runs: readonly CutRun[],
	reason: string,
	makeId: () => string,
): AxcutDocument {
	if (runs.length === 0) return document;
	return {
		...document,
		timeline: {
			...document.timeline,
			trimRanges: wordCutRunsToTrims(document, runs, reason, makeId),
		},
	};
}
