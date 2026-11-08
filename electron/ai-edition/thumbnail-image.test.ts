// F5 step 4's main-process call: the request shape, OpenRouter's response (preview + REAL cost),
// and the two ways it fails without a provider.

import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_THUMBNAIL_IMAGE_MODEL,
	generateThumbnailImage,
	parseThumbnailImageResponse,
	thumbnailImageBody,
} from "./thumbnail-image";

describe("thumbnailImageBody", () => {
	it("asks for a 16:9 PNG from the chosen model", () => {
		const body = JSON.parse(
			thumbnailImageBody({ prompt: "a thumbnail", model: "openai/gpt-image-1" }),
		);
		expect(body).toEqual({
			model: "openai/gpt-image-1",
			prompt: "a thumbnail",
			aspect_ratio: "16:9",
			output_format: "png",
		});
	});

	it("falls back to the Studio's default image model", () => {
		expect(JSON.parse(thumbnailImageBody({ prompt: "x" })).model).toBe(
			DEFAULT_THUMBNAIL_IMAGE_MODEL,
		);
	});
});

describe("parseThumbnailImageResponse", () => {
	it("returns the preview URL, media type and actual cost", () => {
		const result = parseThumbnailImageResponse(
			{
				data: [{ b64_json: "AAAA", media_type: "image/png" }],
				usage: { cost: 0.04 },
			},
			"model/one",
		);
		expect(result).toEqual({
			success: true,
			dataUrl: "data:image/png;base64,AAAA",
			mediaType: "image/png",
			model: "model/one",
			costUsd: 0.04,
		});
	});

	it("reports OpenRouter's error when it returned no image", () => {
		const result = parseThumbnailImageResponse(
			{ error: { message: "moderation blocked" } },
			"model/one",
		);
		expect(result.success).toBe(false);
		expect(result.reason).toBe("empty");
		expect(result.message).toContain("moderation blocked");
	});
});

describe("generateThumbnailImage", () => {
	it("does not call a provider without a key", async () => {
		const fetchImpl = vi.fn();
		const result = await generateThumbnailImage({ prompt: "x" }, { apiKey: "", fetchImpl });
		expect(result.reason).toBe("no-key");
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("posts the prompt with the bearer key and returns the image", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () =>
				JSON.stringify({
					data: [{ b64_json: "BBBB", media_type: "image/png" }],
					usage: { cost: 0.02 },
				}),
		});
		const result = await generateThumbnailImage(
			{ prompt: "a thumbnail", model: "model/two" },
			{ apiKey: "or-key", fetchImpl: fetchImpl as unknown as typeof fetch },
		);
		expect(result.success).toBe(true);
		expect(result.dataUrl).toBe("data:image/png;base64,BBBB");
		expect(result.costUsd).toBe(0.02);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("https://openrouter.ai/api/v1/images");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer or-key");
		expect(JSON.parse(init.body).model).toBe("model/two");
	});

	it("turns a non-2xx answer into an http failure with its message", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			status: 402,
			text: async () => JSON.stringify({ error: { message: "insufficient credits" } }),
		});
		const result = await generateThumbnailImage(
			{ prompt: "x" },
			{ apiKey: "or-key", fetchImpl: fetchImpl as unknown as typeof fetch },
		);
		expect(result.success).toBe(false);
		expect(result.reason).toBe("http");
		expect(result.message).toContain("insufficient credits");
	});
});
