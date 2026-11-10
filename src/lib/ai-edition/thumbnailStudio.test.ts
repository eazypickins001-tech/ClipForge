// The prompt-only Thumbnail Studio: one honest prompt and one publishing block, each declaring the
// evidence it was built from. No provider, no image, no invented facts.

import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./schema";
import {
	buildThumbnailStudio,
	DEFAULT_THUMBNAIL_COMPOSITION,
	defaultStudioInputs,
	defaultThumbnailComposition,
	readThumbnailStudio,
	thumbnailStudioSchema,
	withThumbnailStudio,
} from "./thumbnailStudio";

const inputs = {
	...defaultStudioInputs("Record Better Demos"),
	brief: "Show how to record a clean demo without a second monitor.",
	audience: "solo founders",
};

describe("buildThumbnailStudio", () => {
	it("returns one prompt and the title-only evidence basis", () => {
		const result = buildThumbnailStudio(defaultStudioInputs("Record Better Demos"));
		expect(result.concepts).toHaveLength(1);
		expect(result.concepts[0]?.id).toBe("curiosity");
		expect(result.evidence.basis).toBe("title");
		for (const concept of result.concepts) {
			expect(concept.prompt).toContain("Record Better Demos");
			expect(concept.prompt).toContain("Evidence: the title only");
			expect(concept.rationale.length).toBeGreaterThan(20);
		}
	});

	it("uses the brief and says so, without claiming a transcript", () => {
		const result = buildThumbnailStudio(inputs);
		expect(result.evidence.basis).toBe("title+brief");
		expect(result.publishing.body).toContain(inputs.brief);
		expect(result.concepts[0]?.prompt).toContain("Evidence: the title and brief");
		expect(result.concepts[0]?.prompt).not.toContain("transcript");
	});

	it("adds the transcript to the evidence basis when there is one", () => {
		const result = buildThumbnailStudio(
			inputs,
			"First open the recorder. Then pick the window, not the whole screen, and record once.",
		);
		expect(result.evidence.basis).toBe("title+brief+transcript");
		expect(result.evidence.transcriptExcerpt).toContain("First open the recorder");
		expect(result.publishing.evidence).toBe("title+brief+transcript");
	});

	it("keeps the platform title and X body within their limits", () => {
		const long = "A".repeat(180);
		const youtube = buildThumbnailStudio({ ...inputs, title: long, platform: "youtube" });
		expect(youtube.publishing.title.length).toBeLessThanOrEqual(100);
		const x = buildThumbnailStudio({ ...inputs, platform: "x" });
		expect(x.publishing.body.length).toBeLessThanOrEqual(280);
	});

	it("hashtags are prefixed only where the platform expects it", () => {
		expect(buildThumbnailStudio({ ...inputs, platform: "youtube" }).publishing.tags).toEqual(
			expect.not.arrayContaining([expect.stringMatching(/^#/)]),
		);
		expect(
			buildThumbnailStudio({ ...inputs, platform: "instagram" }).publishing.tags.every((tag) =>
				tag.startsWith("#"),
			),
		).toBe(true);
	});

	it("grounds the prompt in the transcript's own words", () => {
		const result = buildThumbnailStudio(
			inputs,
			"First open the recorder. Then pick the window, not the whole screen, and record once.",
		);
		expect(result.concepts[0]?.prompt).toContain("Context from the video:");
		expect(result.concepts[0]?.prompt).toContain("First open the recorder");
	});

	it("names the destination's format and safe area", () => {
		const youtube =
			buildThumbnailStudio({ ...inputs, platform: "youtube" }).concepts[0]?.prompt ?? "";
		expect(youtube).toContain("16:9 (1280×720)");
		expect(youtube).toContain("Safe area:");
		const tiktok =
			buildThumbnailStudio({ ...inputs, platform: "tiktok" }).concepts[0]?.prompt ?? "";
		expect(tiktok).toContain("9:16");
		expect(tiktok).toContain("upper third");
	});

	it("pulls named subjects and stated numbers into the prompt", () => {
		const result = buildThumbnailStudio({
			...inputs,
			title: "How I edit a week of video in 20 minutes",
			brief: "A walkthrough for GreenBuild Construction, with 3 steps.",
		});
		const prompt = result.concepts[0]?.prompt ?? "";
		expect(prompt).toContain("Main subject: GreenBuild Construction");
		expect(prompt).toContain("20 minutes");
		expect(prompt).toContain("3 steps");
	});
});

describe("the stored composition", () => {
	it("starts the editor on the first concept's thumbnail text", () => {
		const result = buildThumbnailStudio(inputs);
		expect(defaultThumbnailComposition(result).headline).toBe(result.concepts[0]?.thumbnailText);
		expect(defaultThumbnailComposition(null)).toEqual(DEFAULT_THUMBNAIL_COMPOSITION);
	});

	it("round-trips the project composition", () => {
		const studio = { version: 1 as const, inputs, result: buildThumbnailStudio(inputs) };
		const document = withThumbnailStudio(
			createEmptyDocument({ title: "T", projectId: "p" }),
			studio,
		);
		expect(readThumbnailStudio(document)).toEqual(studio);
	});

	it("round-trips the 1280x720 editor settings too", () => {
		const editor = {
			...DEFAULT_THUMBNAIL_COMPOSITION,
			headline: "Hello",
			alignment: "center" as const,
		};
		const studio = { version: 1 as const, inputs, result: buildThumbnailStudio(inputs), editor };
		const document = withThumbnailStudio(
			createEmptyDocument({ title: "T", projectId: "p" }),
			studio,
		);
		expect(readThumbnailStudio(document)?.editor).toEqual(editor);
	});

	it("still parses a project saved with the old three concepts", () => {
		const one = buildThumbnailStudio(inputs);
		const three = {
			...one,
			concepts: [one.concepts[0], one.concepts[0], one.concepts[0]],
		};
		const document = withThumbnailStudio(createEmptyDocument({ title: "T", projectId: "p" }), {
			version: 1,
			inputs,
			result: three,
		});
		expect(readThumbnailStudio(document)?.result.concepts).toHaveLength(3);
	});

	it("ignores a malformed stored value instead of throwing", () => {
		const document = createEmptyDocument({ title: "T", projectId: "p" });
		document.legacyEditor = { thumbnailStudio: { inputs: 3 } };
		expect(readThumbnailStudio(document)).toBeNull();
		expect(thumbnailStudioSchema.safeParse({}).success).toBe(false);
	});
});
