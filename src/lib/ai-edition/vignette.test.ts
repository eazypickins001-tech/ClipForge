import { describe, expect, it } from "vitest";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";
import { isNeutralVignette, VIGNETTE_PARAMS, VIGNETTE_WGSL, vignetteEffect } from "./vignette";

describe("vignetteEffect", () => {
	it("returns null at zero, so nothing is emitted", () => {
		expect(vignetteEffect({ amount: 0 })).toBeNull();
		expect(isNeutralVignette({ amount: 0.005 })).toBe(true);
	});

	it("declares exactly the one param the shader reads, on the compositor's contract", () => {
		const effect = vignetteEffect({ amount: 0.5 });
		expect(effect).not.toBeNull();
		expect(effect?.contract).toBe(SHADER_EFFECT_CONTRACT);
		expect(effect?.params.map((p) => p.name)).toEqual(["amount"]);
		// The shader references the declared param, so the two cannot drift.
		for (const param of VIGNETTE_PARAMS) {
			expect(VIGNETTE_WGSL).toContain(`params.${param.name}`);
		}
	});

	it("is on above the epsilon", () => {
		expect(isNeutralVignette({ amount: 0.2 })).toBe(false);
		expect(vignetteEffect({ amount: 0.2 })).not.toBeNull();
	});
});
