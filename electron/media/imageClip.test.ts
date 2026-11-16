import { describe, expect, it } from "vitest";
import { IMAGE_EXTENSIONS, imageClipArgs, isImagePath, STILL_DURATION_SEC } from "./imageClip";

describe("isImagePath", () => {
	it("recognises the image types the picker offers, case-insensitively", () => {
		for (const ext of IMAGE_EXTENSIONS) expect(isImagePath(`/a/b${ext}`)).toBe(true);
		expect(isImagePath("/a/B.PNG")).toBe(true);
		expect(isImagePath("/a/b.mp4")).toBe(false);
		expect(isImagePath("/a/b")).toBe(false);
	});
});

describe("imageClipArgs", () => {
	it("loops the still into a short silent H.264 proxy with even dimensions", () => {
		const args = imageClipArgs("/in/logo.png", "/out/still.mp4");
		expect(args).toEqual([
			"-y",
			"-hide_banner",
			"-loglevel",
			"error",
			"-loop",
			"1",
			"-i",
			"/in/logo.png",
			"-t",
			STILL_DURATION_SEC.toFixed(3),
			"-r",
			"30",
			"-vf",
			"scale=trunc(iw/2)*2:trunc(ih/2)*2",
			"-c:v",
			"libopenh264",
			"-pix_fmt",
			"yuv420p",
			"-an",
			"/out/still.mp4",
		]);
	});
});
