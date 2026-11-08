// The prompt-only Thumbnail Studio: three honest concepts and one publishing block, each declaring
// the evidence it was built from. No provider, no image, no invented facts.

import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./schema";
import {
	buildThumbnailStudio,
	defaultStudioInputs,
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
	it("returns three distinct concepts and the title-only evidence basis", () => {
		const result = buildThumbnailStudio(defaultStudioInputs("Record Better Demos"));
		expect(result.concepts).toHaveLength(3);
		expect(new Set(result.concepts.map((concept) => concept.id)).size).toBe(3);
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
});

describe("the stored composition", () => {
	it("round-trips through the project envelope", () => {
		const studio = { inputs, result: buildThumbnailStudio(inputs) };
		const document = withThumbnailStudio(
			createEmptyDocument({ title: "T", projectId: "p" }),
			studio,
		);
		expect(readThumbnailStudio(document)).toEqual(studio);
	});

	it("ignores a malformed stored value instead of throwing", () => {
		const document = createEmptyDocument({ title: "T", projectId: "p" });
		document.legacyEditor = { thumbnailStudio: { inputs: 3 } };
		expect(readThumbnailStudio(document)).toBeNull();
		expect(thumbnailStudioSchema.safeParse({}).success).toBe(false);
	});
});
