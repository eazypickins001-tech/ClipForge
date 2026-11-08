// Thumbnail Studio's prompt-only core, plus the publishing copy that sits beside it.
//
// This is deliberately local and deterministic: F5 starts with the half that needs no credentials or
// spend, so nothing here calls a provider. It composes three distinct thumbnail concepts and one
// platform-ready publishing block from the inputs the creator gave and, when the project has one,
// the transcript. Every result carries the EVIDENCE BASIS it was built from, so a concept can never
// quietly pretend to know something the footage never said.
//
// The composition is stored as data in the project envelope (`legacyEditor.thumbnailStudio`, which
// the schema passes through), never as an image. Image generation, the composition editor and PNG
// export are the later F5 steps and are not claimed here.

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

export interface StoredThumbnailStudio {
	inputs: ThumbnailStudioInputs;
	result: ThumbnailStudioResult;
	/** The generated image's metadata, not its bytes. Absent until the creator generates one. */
	image?: StoredThumbnailImage;
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
	const palette = brand
		? ["brand colours from the kit", "one high-contrast accent"]
		: ["#0f172a", "#f8fafc", "#f59e0b"];
	const evidenceNote = `Evidence: ${evidenceLabel(basis)} — do not depict anything they do not state.`;
	const who = audience ? `Audience: ${audience}.` : "";
	const kit = brand ? `Brand kit: ${brand}.` : "";
	const avoid = exclusions ? `Do not include: ${exclusions}.` : "";

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
			`A 16:9 video thumbnail for "${title}".`,
			composition,
			`Focal point: ${focalPoint}.`,
			`Palette: ${palette.join(", ")}.`,
			`Bold thumbnail text: "${thumbnailText}".`,
			who,
			kit,
			avoid,
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
			"Subject on the left third and a tight crop of the payoff on the right, with the text in the top-left safe area.",
			`The result of "${title}", clearly visible`,
			text,
			"A visible payoff with the method withheld is the most reliable curiosity gap: the text names the outcome, not the process.",
		),
		concept(
			"benefit",
			"State the result the viewer gets.",
			"Subject on the right, one short benefit line in large type on the left, and generous empty space between them.",
			"The person or object the result belongs to",
			(brief ? keywords.slice(0, 4).join(" ") : text).toUpperCase().slice(0, 30),
			"A direct benefit reads at a glance and survives a small mobile thumbnail, where a busy scene does not.",
		),
		concept(
			"contrast",
			"Show the change.",
			"Split frame: the before state on the left, the after state on the right, divided by a clean vertical edge.",
			"The difference between the two states",
			"BEFORE / AFTER",
			"Contrast makes a change legible without a sentence, and the split gives the eye one place to land.",
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
	inputs: inputsSchema,
	result: z.object({
		concepts: z.array(conceptSchema).length(3),
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
