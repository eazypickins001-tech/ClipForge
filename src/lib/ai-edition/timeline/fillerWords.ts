// Which words are hesitations.
//
// This is the only place in the app that names a word a filler, and that is a deliberate limit
// rather than an oversight: `aggregated-transcript.ts` explains at length that the document has no
// filler concept, because a word list cannot tell a hesitation from a meaningful word. So the list
// here is narrow enough to be safe on its own, and everything that needs to read the sentence
// around a word stays with the agent, which can.
//
// Whether a word may be CUT is a different question, and it is not answered here — see
// `planWordCuts` in `../document/wordCuts.ts`, which owns that rule for every caller.

import { documentTranscripts } from "../document/wordCuts";
import type { AxcutDocument } from "../schema";

/**
 * Non-lexical hesitations: sounds that carry no meaning of their own, which is what makes them safe
 * to cut without reading the sentence around them.
 *
 * Deliberately NOT here: "like", "so", "right", "actually", "basically", "you know", "I mean".
 * Those are fillers only sometimes, and a word list cannot tell the two uses apart — cutting the
 * "like" out of "I'd like to show you" is a much worse outcome than leaving a filler in. Judging
 * those needs the sentence, which is what the agent's `removeWords` tool is for.
 */
const FILLER_WORDS = new Set([
	"um",
	"uh",
	"umm",
	"uhh",
	"ummm",
	"uhhh",
	"uhm",
	"erm",
	"er",
	"hmm",
	"hmmm",
	"mm",
	"mmm",
	"mhm",
	"ah",
	"ahh",
	"eh",
	"huh",
]);

/**
 * Whether a word is a hesitation. Tolerant of how a transcript actually writes one: capitalised at
 * the start of a segment ("Um, so…"), carrying punctuation, or wrapped in quotes.
 *
 * Everything that is not a letter is dropped rather than trimmed from the ends, so an interrupted
 * "u—m" still reads as "um". A hyphenated "uh-huh" becomes "uhhuh", which is not in the list, and
 * that is the intended outcome — it is an answer, not a hesitation.
 */
export function isFillerWord(text: string): boolean {
	const normalised = text.toLowerCase().replace(/[^\p{L}]/gu, "");
	return normalised.length > 0 && FILLER_WORDS.has(normalised);
}

/**
 * The hesitation ids in the document, grouped by the transcript they came from.
 *
 * Grouped rather than flat because word ids restart per asset — the same id can name a word in two
 * transcripts, and `planWordCuts` reads a repeated id as ambiguous unless it is told the asset.
 * Ids, not spans: what can be cut is `planWordCuts`' decision, not this file's.
 */
export function fillerWordIdsByAsset(
	document: AxcutDocument,
): Array<{ assetId: string; wordIds: string[] }> {
	return documentTranscripts(document)
		.map((transcript) => ({
			assetId: transcript.assetId,
			wordIds: transcript.words.filter((word) => isFillerWord(word.text)).map((word) => word.id),
		}))
		.filter((group) => group.wordIds.length > 0);
}
