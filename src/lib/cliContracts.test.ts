import { describe, expect, it } from "vitest";
import { audioRenderDims, audioRenderPath } from "./cliContracts";

// The compositor's own rule, from `resolve_output_size` in compositor-view-napi: a size whose
// shape is more than 3% off the scene's output frame is refused outright.
const shapeDiffers = (w: number, h: number, ow: number, oh: number) =>
	Math.abs(w * oh - h * ow) * 100 > 3 * h * ow;

describe("audio render target", () => {
	it("sits beside the output it belongs to", () => {
		expect(audioRenderPath("C:/Users/me/Videos/take.wav")).toBe(
			"C:/Users/me/Videos/take.wav.render.mp4",
		);
	});

	it("keeps the scene's shape, which is the only thing the compositor accepts", () => {
		// The portrait default that started this, and the shapes a project can otherwise have.
		const shapes: Array<[number, number]> = [
			[1088, 1920],
			[1920, 1080],
			[1080, 1080],
			[2560, 1440],
			[720, 1280],
			[1000, 1000],
		];
		for (const [width, height] of shapes) {
			const dims = audioRenderDims({ width, height });
			expect(shapeDiffers(dims.width, dims.height, width, height)).toBe(false);
		}
	});

	it("scales the long side to the budget and stays on even pixels", () => {
		// NV12 4:2:0: the compositor rasterises to this size, so both axes are even.
		expect(audioRenderDims({ width: 1088, height: 1920 })).toEqual({ width: 204, height: 360 });
		expect(audioRenderDims({ width: 1920, height: 1080 })).toEqual({ width: 360, height: 202 });
		expect(audioRenderDims({ width: 1000, height: 1000 })).toEqual({ width: 360, height: 360 });
	});

	it("never enlarges a project that is already smaller than the budget", () => {
		expect(audioRenderDims({ width: 320, height: 180 })).toEqual({ width: 320, height: 180 });
		expect(audioRenderDims({ width: 180, height: 320 })).toEqual({ width: 180, height: 320 });
	});
});
