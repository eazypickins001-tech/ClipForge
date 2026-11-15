import { describe, expect, it } from "vitest";
import {
	COLOUR_GRADE_PARAMS,
	COLOUR_GRADE_WGSL,
	COLOUR_PRESETS,
	type ColourGrade,
	colourGradeEffect,
	DEFAULT_COLOUR_GRADE,
	isNeutralColourGrade,
	matchingColourPreset,
} from "./colourGrade";
import { type ColourLut, LUT_VALUES } from "./colourLut";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";

const grade = (patch: Partial<ColourGrade>): ColourGrade => ({ ...DEFAULT_COLOUR_GRADE, ...patch });

const lut = (): ColourLut => ({ name: "Test", data: new Array(LUT_VALUES).fill(0.5) });

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

	it("folds an active LUT into the same shader and its params", () => {
		const effect = colourGradeEffect(DEFAULT_COLOUR_GRADE, lut(), 0.8);
		expect(effect).not.toBeNull();
		expect(effect?.code).toContain("fn fx_lut");
		expect(effect?.code).toContain("params.lutStrength");
		expect(effect?.params.map((param) => param.name)).toContain("lutStrength");
	});

	it("does not emit a LUT at zero strength, and keeps the old code without one", () => {
		expect(colourGradeEffect(DEFAULT_COLOUR_GRADE, lut(), 0)).toBeNull();
		const plain = colourGradeEffect(grade({ saturation: 1.2 }));
		expect(plain?.code).not.toContain("fx_lut");
	});

	it("declares exactly the six params the shader reads, on the compositor's contract", () => {
		const effect = colourGradeEffect(grade({ saturation: 1.5 }));
		expect(effect).not.toBeNull();
		expect(effect?.contract).toBe(SHADER_EFFECT_CONTRACT);
		expect(effect?.params.map((p) => p.name)).toEqual([
			"exposure",
			"contrast",
			"saturation",
			"temperature",
			"tint",
			"hue",
		]);
		// The shader references every declared param, so the two cannot drift.
		for (const param of COLOUR_GRADE_PARAMS) {
			expect(COLOUR_GRADE_WGSL).toContain(`params.${param.name}`);
		}
	});
});

describe("COLOUR_PRESETS", () => {
	it("keeps every preset inside the sliders' own ranges", () => {
		for (const preset of COLOUR_PRESETS) {
			for (const param of COLOUR_GRADE_PARAMS) {
				const value = preset.grade[param.name as keyof ColourGrade];
				if (param.min !== undefined) expect(value).toBeGreaterThanOrEqual(param.min);
				if (param.max !== undefined) expect(value).toBeLessThanOrEqual(param.max);
			}
		}
	});

	it("round-trips each preset, and a custom mix matches none", () => {
		for (const preset of COLOUR_PRESETS) {
			expect(matchingColourPreset(preset.grade)).toBe(preset.id);
		}
		expect(matchingColourPreset(grade({ exposure: 0.42 }))).toBeNull();
	});

	it("keeps neutral neutral, so choosing it emits no effect", () => {
		const neutral = COLOUR_PRESETS.find((preset) => preset.id === "neutral");
		expect(neutral).toBeDefined();
		expect(neutral && isNeutralColourGrade(neutral.grade)).toBe(true);
	});
});
