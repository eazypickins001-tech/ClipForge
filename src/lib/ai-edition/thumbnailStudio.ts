// Thumbnail Studio's prompt-only core, plus the publishing copy that sits beside it.
//
// This is deliberately local and deterministic: F5 starts with the half that needs no credentials or
// spend, so nothing here calls a provider. It composes ONE thumbnail prompt — the text a creator
// pastes into any image tool — and one platform-ready publishing block from the inputs the creator
// gave and, when the project has one, the transcript. Every result carries the EVIDENCE BASIS it was
// built from, so the prompt can never quietly pretend to know something the footage never said.
//
// The composition is stored as data in the project envelope (`legacyEditor.thumbnailStudio`, which
// the schema passes through), never as an image. No image model is called here or by this panel.
//
// Historical note: the first cut produced three concepts (curiosity / benefit / contrast). The
// panel now shows one prompt, because the output is something to take to an external image tool,
// not a set of directions to choose between; the stored array keeps its shape so old projects
// still parse, and only its first entry is used.

import { z } from "zod";
import type { AxcutDocument } from "./schema";

export const STUDIO_PLATFORMS = ["youtube", "tiktok", "instagram", "x", "linkedin"] as const;
export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

/** The OpenRouter image model the Studio offers by default; the panel lets the creator change it. */
export const DEFAULT_THUMBNAIL_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export const STUDIO_EVIDENCE = [
	"title",
	"title+brief",
	"title+transcript",
	"title+brief+transcript",
] as const;
export type StudioEvidenceBasis = (typeof STUDIO_EVIDENCE)[number];

export interface ThumbnailStudioInputs {
	title: string;
	brief: string;
	audience: string;
	platform: StudioPlatform;
	brand: string;
	exclusions: string;
}

export interface ThumbnailConcept {
	id: "curiosity" | "benefit" | "contrast";
	hook: string;
	composition: string;
	focalPoint: string;
	palette: string[];
	thumbnailText: string;
	/** The prompt a creator pastes into any image tool. Editable in the panel. */
	prompt: string;
	rationale: string;
	evidence: StudioEvidenceBasis;
}

export interface PublishingCopy {
	title: string;
	body: string;
	tags: string[];
	evidence: StudioEvidenceBasis;
}

export interface ThumbnailStudioResult {
	concepts: ThumbnailConcept[];
	publishing: PublishingCopy;
	evidence: {
		basis: StudioEvidenceBasis;
		/** The exact transcript stretch used, when there was one. */
		transcriptExcerpt?: string;
	};
}

export interface StoredThumbnailImage {
	model: string;
	/** Where the user saved the file. The bytes never live in the composition. */
	path?: string;
	mediaType?: string;
	/** What OpenRouter reported for the generation, in USD. */
	costUsd?: number;
}

/** The 1280×720 composition's settings. The pixels are rendered from these; no image is stored. */
export type ThumbnailAlignment = "left" | "center" | "right";
export type ThumbnailCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface ThumbnailComposition {
	headline: string;
	/** Pixels on the 1280×720 canvas. */
	fontSize: number;
	textColor: string;
	outlineColor: string;
	outlineWidth: number;
	alignment: ThumbnailAlignment;
	/** 1 = the image just covers the frame; above crops further in. */
	backgroundZoom: number;
	logoCorner: ThumbnailCorner;
	/** Fraction of the canvas width. */
	logoSize: number;
	/** The logo file the creator picked; the document never holds its bytes. */
	logoPath?: string;
}

export const DEFAULT_THUMBNAIL_COMPOSITION: ThumbnailComposition = {
	headline: "YOUR HEADLINE",
	fontSize: 84,
	textColor: "#ffffff",
	outlineColor: "#000000",
	outlineWidth: 5,
	alignment: "left",
	backgroundZoom: 1,
	logoCorner: "top-right",
	logoSize: 0.14,
};

export function defaultThumbnailComposition(
	result?: ThumbnailStudioResult | null,
): ThumbnailComposition {
	return {
		...DEFAULT_THUMBNAIL_COMPOSITION,
		headline: result?.concepts[0]?.thumbnailText || DEFAULT_THUMBNAIL_COMPOSITION.headline,
	};
}

export interface StoredThumbnailStudio {
	/** The composition's data version. Bump when the stored shape changes incompatibly. */
	version: 1;
	inputs: ThumbnailStudioInputs;
	result: ThumbnailStudioResult;
	/** The generated image's metadata, not its bytes. Absent until the creator generates one. */
	image?: StoredThumbnailImage;
	/** The 1280×720 composition's settings. Absent until the creator edits it. */
	editor?: ThumbnailComposition;
}

const PLATFORM_LIMITS: Record<StudioPlatform, { title: number; tags: number; hashtags: boolean }> =
	{
		youtube: { title: 100, tags: 10, hashtags: false },
		tiktok: { title: 100, tags: 8, hashtags: true },
		instagram: { title: 125, tags: 10, hashtags: true },
		x: { title: 200, tags: 4, hashtags: true },
		linkedin: { title: 120, tags: 4, hashtags: true },
	};

const STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"but",
	"by",
	"for",
	"from",
	"how",
	"i",
	"in",
	"into",
	"is",
	"it",
	"its",
	"of",
	"on",
	"or",
	"that",
	"the",
	"their",
	"this",
	"to",
	"was",
	"we",
	"what",
	"when",
	"where",
	"who",
	"why",
	"will",
	"with",
	"you",
	"your",
]);

export function defaultStudioInputs(projectTitle: string): ThumbnailStudioInputs {
	return {
		title: projectTitle.trim() || "Untitled video",
		brief: "",
		audience: "",
		platform: "youtube",
		brand: "",
		exclusions: "",
	};
}

/** Meaningful lowercase words from any of the evidence, deduped, longest-first, in input order. */
export function studioKeywords(...parts: string[]): string[] {
	const seen = new Set<string>();
	const words: string[] = [];
	for (const part of parts) {
		for (const raw of part.toLowerCase().split(/[^a-z0-9]+/)) {
			if (raw.length < 3 || STOPWORDS.has(raw) || seen.has(raw)) continue;
			seen.add(raw);
			words.push(raw);
		}
	}
	return words;
}

function sentence(text: string, maxChars: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= maxChars) return clean;
	const cut = clean.slice(0, maxChars);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function truncateTitle(title: string, limit: number): string {
	if (title.length <= limit) return title;
	const cut = title.slice(0, limit - 1);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function tagWords(keywords: string[], platform: StudioPlatform): string[] {
	const limit = PLATFORM_LIMITS[platform].tags;
	const picked = keywords.slice(0, limit);
	return PLATFORM_LIMITS[platform].hashtags ? picked.map((word) => `#${word}`) : picked;
}

function evidenceLabel(basis: StudioEvidenceBasis): string {
	switch (basis) {
		case "title":
			return "the title only";
		case "title+brief":
			return "the title and brief";
		case "title+transcript":
			return "the title and transcript";
		case "title+brief+transcript":
			return "the title, brief and transcript";
	}
}

/**
 * Capitalised multi-word names (and all-caps acronyms) from the evidence: the concrete subjects an
 * image can actually show. Single capitalised words are skipped — they are usually just sentence
 * starts, and the title already names the video.
 */
function namedSubjects(...parts: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of parts) {
		const matches = part.match(/\b[A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*)*\b/g) ?? [];
		for (const raw of matches) {
			const words = raw.trim().split(/\s+/);
			const acronym =
				words.length === 1 && words[0].length >= 2 && words[0] === words[0].toUpperCase();
			if (words.length < 2 && !acronym) continue;
			const key = raw.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(raw.trim());
		}
	}
	return out;
}

/** Numbers the evidence actually states — a duration, count or percentage — as a proof point the
 *  thumbnail may show. Extracted, never invented. */
function proofPoints(...parts: string[]): string[] {
	const found = new Set<string>();
	for (const part of parts) {
		const matches =
			part.match(
				/\b\d[\d.,]*\s*(?:%|x|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|steps?|ways?|tips?|tools?|seconds?|secs?)\b/gi,
			) ?? [];
		for (const match of matches) found.add(match.replace(/\s+/g, " ").trim());
	}
	return [...found].slice(0, 4);
}

/**
 * How each destination presents a cover: its aspect ratio and the zones the platform paints over
 * (duration badge, action rail, timestamp). A context-aware prompt names the format it is drawn
 * for, so the same text is not asked to sit under TikTok's action rail.
 */
const PLATFORM_PRESENTATION: Record<
	StudioPlatform,
	{ name: string; aspect: string; safe: string; portrait: boolean }
> = {
	youtube: {
		name: "YouTube",
		aspect: "16:9 (1280×720)",
		safe: "keep the text inside the central safe area and clear of the bottom-right duration badge",
		portrait: false,
	},
	x: {
		name: "X",
		aspect: "16:9",
		safe: "keep the text clear of the bottom-left timestamp and the bottom-right action row",
		portrait: false,
	},
	linkedin: {
		name: "LinkedIn",
		aspect: "16:9",
		safe: "keep the text clear of the bottom-right play button",
		portrait: false,
	},
	tiktok: {
		name: "TikTok",
		aspect: "9:16 (1080×1920 cover)",
		safe: "keep the text in the upper-middle third and clear of the bottom action rail and the top status bar",
		portrait: true,
	},
	instagram: {
		name: "Instagram",
		aspect: "4:5 (1080×1350 feed cover)",
		safe: "keep the text inside the central safe area",
		portrait: true,
	},
};

/**
 * Build the studio's whole result. `transcriptText` is optional: without it the evidence basis says
 * so, and the prompts tell the image tool not to depict anything the inputs do not state.
 */
export function buildThumbnailStudio(
	inputs: ThumbnailStudioInputs,
	transcriptText = "",
): ThumbnailStudioResult {
	const title = inputs.title.trim() || "Untitled video";
	const brief = inputs.brief.replace(/\s+/g, " ").trim();
	const audience = inputs.audience.replace(/\s+/g, " ").trim();
	const brand = inputs.brand.replace(/\s+/g, " ").trim();
	const exclusions = inputs.exclusions.replace(/\s+/g, " ").trim();
	const transcript = transcriptText.replace(/\s+/g, " ").trim();
	const basis: StudioEvidenceBasis =
		brief && transcript
			? "title+brief+transcript"
			: brief
				? "title+brief"
				: transcript
					? "title+transcript"
					: "title";
	const excerpt = transcript ? sentence(transcript, 220) : undefined;
	const keywords = studioKeywords(title, brief, transcript);
	const text = (keywords.slice(0, 3).join(" ") || "WATCH THIS").toUpperCase().slice(0, 30);
	const headlineText = (brief ? keywords.slice(0, 4).join(" ") : text).toUpperCase().slice(0, 30);
	const palette = brand
		? ["brand colours from the kit", "one high-contrast accent"]
		: ["#0f172a", "#f8fafc", "#f59e0b"];
	const evidenceNote = `Evidence: ${evidenceLabel(basis)} — do not depict anything they do not state.`;
	const who = audience ? `Audience: ${audience}.` : "";
	const kit = brand ? `Brand kit: ${brand}.` : "";
	const avoid = exclusions ? `Do not include: ${exclusions}.` : "";

	// Context the prompt can stand on: the destination's format, the named subjects and the numbers
	// the video states. All extracted from what the creator supplied or the transcript says —
	// nothing here is invented.
	const presentation = PLATFORM_PRESENTATION[inputs.platform];
	const subjects = namedSubjects(brief, transcript);
	const proofs = proofPoints(title, brief, transcript);
	const subjectLine =
		subjects.length > 0 ? `Main subject: ${subjects.slice(0, 3).join(", ")}.` : "";
	const contextLine = excerpt ? `Context from the video: "${excerpt}"` : "";
	const proofLine = proofs.length > 0 ? `Proof points to show: ${proofs.join(", ")}.` : "";
	const composition = presentation.portrait
		? "Subject filling the frame (waist-up if a person), the bold text in the upper third, and clean space at the bottom for the platform's action rail."
		: "One clear subject (or a tight crop of the payoff) on one side, the bold text in the opposite safe area, and enough empty space that nothing competes with the face or the result.";

	const concept = (
		id: ThumbnailConcept["id"],
		hook: string,
		composition: string,
		focalPoint: string,
		thumbnailText: string,
		rationale: string,
	): ThumbnailConcept => ({
		id,
		hook,
		composition,
		focalPoint,
		palette,
		thumbnailText,
		prompt: [
			`A ${presentation.aspect} video thumbnail for "${title}" on ${presentation.name}.`,
			composition,
			subjectLine,
			contextLine,
			proofLine,
			`Focal point: ${focalPoint}.`,
			`Palette: ${palette.join(", ")}.`,
			`Bold thumbnail text: "${thumbnailText}".`,
			`Safe area: ${presentation.safe}.`,
			who,
			kit,
			avoid,
			"Quality: high contrast, uncluttered, and readable at a glance on a phone.",
			evidenceNote,
		]
			.filter(Boolean)
			.join(" "),
		rationale,
		evidence: basis,
	});

	const concepts: ThumbnailConcept[] = [
		concept(
			"curiosity",
			"Show the payoff, withhold the method.",
			composition,
			`The result of "${title}", clearly visible`,
			headlineText,
			"A visible payoff with the method withheld is the most reliable curiosity gap: the text names the outcome, not the process.",
		),
	];

	const cta = audience ? `Made for ${audience}.` : "";
	const summary = brief || excerpt || "";
	const limit = PLATFORM_LIMITS[inputs.platform];
	const publishing: PublishingCopy = {
		title: truncateTitle(title, limit.title),
		body: [title, summary, cta]
			.filter(Boolean)
			.join("\n\n")
			.slice(0, inputs.platform === "x" ? 280 : 5000),
		tags: tagWords(keywords, inputs.platform),
		evidence: basis,
	};

	return {
		concepts,
		publishing,
		evidence: { basis, ...(excerpt ? { transcriptExcerpt: excerpt } : {}) },
	};
}

const inputsSchema = z.object({
	title: z.string(),
	brief: z.string(),
	audience: z.string(),
	platform: z.enum(STUDIO_PLATFORMS),
	brand: z.string(),
	exclusions: z.string(),
});
const evidenceSchema = z.enum(STUDIO_EVIDENCE);
const conceptSchema = z.object({
	id: z.enum(["curiosity", "benefit", "contrast"]),
	hook: z.string(),
	composition: z.string(),
	focalPoint: z.string(),
	palette: z.array(z.string()),
	thumbnailText: z.string(),
	prompt: z.string(),
	rationale: z.string(),
	evidence: evidenceSchema,
});
export const thumbnailStudioSchema = z.object({
	version: z.literal(1).default(1),
	inputs: inputsSchema,
	result: z.object({
		// One prompt now; old projects carry three and still parse. The panel reads the first.
		concepts: z.array(conceptSchema).min(1),
		publishing: z.object({
			title: z.string(),
			body: z.string(),
			tags: z.array(z.string()),
			evidence: evidenceSchema,
		}),
		evidence: z.object({
			basis: evidenceSchema,
			transcriptExcerpt: z.string().optional(),
		}),
	}),
	image: z
		.object({
			model: z.string(),
			path: z.string().optional(),
			mediaType: z.string().optional(),
			costUsd: z.number().optional(),
		})
		.optional(),
	editor: z
		.object({
			headline: z.string(),
			fontSize: z.number().min(8).max(240),
			textColor: z.string(),
			outlineColor: z.string(),
			outlineWidth: z.number().min(0).max(24),
			alignment: z.enum(["left", "center", "right"]),
			backgroundZoom: z.number().min(1).max(3),
			logoCorner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
			logoSize: z.number().min(0.03).max(0.4),
			logoPath: z.string().optional(),
		})
		.optional(),
});

/** The saved studio for this project, or null when it has none / the stored value is malformed. */
export function readThumbnailStudio(document: AxcutDocument): StoredThumbnailStudio | null {
	const legacy = document.legacyEditor as { thumbnailStudio?: unknown } | null | undefined;
	const parsed = thumbnailStudioSchema.safeParse(legacy?.thumbnailStudio);
	return parsed.success ? (parsed.data as StoredThumbnailStudio) : null;
}

/** Store the studio in the project envelope, leaving the rest of that envelope untouched. */
export function withThumbnailStudio(
	document: AxcutDocument,
	data: StoredThumbnailStudio,
): AxcutDocument {
	const legacy = (document.legacyEditor as Record<string, unknown> | null | undefined) ?? {};
	return {
		...document,
		legacyEditor: { ...legacy, thumbnailStudio: data },
	};
}
