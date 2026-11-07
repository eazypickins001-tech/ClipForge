import { describe, expect, it } from "vitest";
import {
	COLOUR_GRADE_PARAMS,
	COLOUR_GRADE_WGSL,
	type ColourGrade,
	colourGradeEffect,
	DEFAULT_COLOUR_GRADE,
	isNeutralColourGrade,
} from "./colourGrade";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";

const grade = (patch: Partial<ColourGrade>): ColourGrade => ({ ...DEFAULT_COLOUR_GRADE, ...patch });

describe("isNeutralColourGrade", () => {
	it("is true at the defaults and false when any axis moves", () => {
		expect(isNeutralColourGrade(DEFAULT_COLOUR_GRADE)).toBe(true);
		expect(isNeutralColourGrade(grade({ exposure: 0.5 }))).toBe(false);
		expect(isNeutralColourGrade(grade({ contrast: 1.2 }))).toBe(false);
		expect(isNeutralColourGrade(grade({ saturation: 0 }))).toBe(false);
		expect(isNeutralColourGrade(grade({ temperature: -30 }))).toBe(false);
		expect(isNeutralColourGrade(grade({ tint: 30 }))).toBe(false);
	});

	it("treats sub-step float noise as neutral", () => {
		expect(isNeutralColourGrade(grade({ exposure: 0.001 }))).toBe(true);
		expect(isNeutralColourGrade(grade({ contrast: 1.001 }))).toBe(true);
	});
});

describe("colourGradeEffect", () => {
	it("returns null for a neutral grade, so nothing is emitted", () => {
		expect(colourGradeEffect(DEFAULT_COLOUR_GRADE)).toBeNull();
	});

	it("declares exactly the five params the shader reads, on the compositor's contract", () => {
		const effect = colourGradeEffect(grade({ saturation: 1.5 }));
		expect(effect).not.toBeNull();
		expect(effect?.contract).toBe(SHADER_EFFECT_CONTRACT);
		expect(effect?.params.map((p) => p.name)).toEqual([
			"exposure",
			"contrast",
			"saturation",
			"temperature",
			"tint",
		]);
		// The shader references every declared param, so the two cannot drift.
		for (const param of COLOUR_GRADE_PARAMS) {
			expect(COLOUR_GRADE_WGSL).toContain(`params.${param.name}`);
		}
	});
});
