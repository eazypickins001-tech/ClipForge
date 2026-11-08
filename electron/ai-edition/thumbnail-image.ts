// F5 step 4: generate a thumbnail image from the Studio's prompt through OpenRouter's Image API.
//
// The renderer never sees the API key and never writes a file: the main process calls
// `POST /api/v1/images` with the stored OpenRouter credential, returns the image as a data URL for
// preview, and a separate IPC writes the chosen image to disk. The composition keeps only the path
// and the reported cost — never image bytes.

import { DEFAULT_THUMBNAIL_IMAGE_MODEL } from "../../src/lib/ai-edition/thumbnailStudio";

export { DEFAULT_THUMBNAIL_IMAGE_MODEL };
/** Image generation is slow (the docs' own example takes 94 s); this is the cap, not a target. */
export const THUMBNAIL_IMAGE_TIMEOUT_MS = 120_000;

export interface ThumbnailImageRequest {
	prompt: string;
	/** An OpenRouter image model slug; omitted uses {@link DEFAULT_THUMBNAIL_IMAGE_MODEL}. */
	model?: string;
}

export interface ThumbnailImageResult {
	success: boolean;
	/** `data:image/png;base64,…` — preview only; the composition stores the saved path instead. */
	dataUrl?: string;
	mediaType?: string;
	model?: string;
	/** What OpenRouter reported for this generation, in USD. */
	costUsd?: number;
	message?: string;
	reason?: "no-key" | "empty" | "http" | "timeout" | "network" | "busy";
}

/** Pure: the JSON body sent to `/images`. Pinned by the test. */
export function thumbnailImageBody(request: ThumbnailImageRequest): string {
	return JSON.stringify({
		model: request.model?.trim() || DEFAULT_THUMBNAIL_IMAGE_MODEL,
		prompt: request.prompt,
		aspect_ratio: "16:9",
		output_format: "png",
	});
}

/** Pure: turn OpenRouter's response into a preview URL and the real cost. */
export function parseThumbnailImageResponse(payload: unknown, model: string): ThumbnailImageResult {
	const body = payload as {
		data?: Array<{ b64_json?: unknown; media_type?: unknown }>;
		usage?: { cost?: unknown };
		error?: { message?: unknown } | string;
	};
	const first = body?.data?.[0];
	const base64 = typeof first?.b64_json === "string" ? first.b64_json : "";
	if (!base64) {
		const error =
			typeof body?.error === "string"
				? body.error
				: typeof body?.error?.message === "string"
					? body.error.message
					: "OpenRouter returned no image.";
		return { success: false, model, message: error, reason: "empty" };
	}
	const mediaType =
		typeof first?.media_type === "string" && first.media_type.startsWith("image/")
			? first.media_type
			: "image/png";
	const cost = typeof body.usage?.cost === "number" ? body.usage.cost : undefined;
	return {
		success: true,
		dataUrl: `data:${mediaType};base64,${base64}`,
		mediaType,
		model,
		...(cost === undefined ? {} : { costUsd: cost }),
	};
}

export async function generateThumbnailImage(
	request: ThumbnailImageRequest,
	options: {
		apiKey: string;
		baseUrl?: string;
		fetchImpl?: typeof fetch;
		timeoutMs?: number;
	},
): Promise<ThumbnailImageResult> {
	const model = request.model?.trim() || DEFAULT_THUMBNAIL_IMAGE_MODEL;
	if (!options.apiKey.trim()) {
		return {
			success: false,
			model,
			reason: "no-key",
			message: "Connect OpenRouter in AI settings to generate images.",
		};
	}
	const endpoint = `${(options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")}/images`;
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		Math.max(1_000, options.timeoutMs ?? THUMBNAIL_IMAGE_TIMEOUT_MS),
	);
	try {
		const response = await (options.fetchImpl ?? fetch)(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
				"Content-Type": "application/json",
			},
			body: thumbnailImageBody({ ...request, model }),
			signal: controller.signal,
		});
		const text = await response.text();
		let payload: unknown = null;
		try {
			payload = JSON.parse(text);
		} catch {
			payload = null;
		}
		if (!response.ok) {
			const parsed = parseThumbnailImageResponse(payload, model);
			return {
				success: false,
				model,
				reason: "http",
				message: parsed.message ?? `OpenRouter answered ${response.status}: ${text.slice(0, 200)}`,
			};
		}
		if (payload === null) {
			return {
				success: false,
				model,
				reason: "empty",
				message: "OpenRouter returned a response this build could not read.",
			};
		}
		return parseThumbnailImageResponse(payload, model);
	} catch (error) {
		const aborted = controller.signal.aborted;
		return {
			success: false,
			model,
			reason: aborted ? "timeout" : "network",
			message: aborted
				? `Image generation timed out after ${Math.round(
						(options.timeoutMs ?? THUMBNAIL_IMAGE_TIMEOUT_MS) / 1000,
					)}s.`
				: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}
