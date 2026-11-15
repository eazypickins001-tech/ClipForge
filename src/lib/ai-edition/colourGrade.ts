// A global colour grade: the six moves people reach for — exposure, contrast, saturation,
// temperature, tint and hue — applied to the whole programme as one fixed WGSL effect.
//
// It rides the AGENT shader-effect pipeline (`crates/compositor/src/shader_fx.rs`): the compositor
// already compiles and runs `fn effect(uv) -> vec4` per frame on all three backends, so a colour
// grade is just a shader whose parameters are the six controls. No new Rust pass, no new scene
// struct. `frame(uv)` reads the composed picture (footage + webcam + background), which is the
// "filter over the whole frame" look this ships; a footage-only grade (via `footage()`) is a later
// refinement, not this slice.
//
// Neutral means "no grade": the shader is the identity at the defaults, and `colourGradeEffect`
// returns null for it, so a project that never touches colour emits exactly the payload it always
// did.

import { type ColourLut, hasColourLut, lutShaderBody } from "./colourLut";
import type { AxcutShaderEffect, AxcutShaderEffectParam } from "./schema";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";

export interface ColourGrade {
	exposure: number;
	contrast: number;
	saturation: number;
	temperature: number;
	tint: number;
	/** Hue rotation in degrees, -180..180. 0 is the identity. */
	hue: number;
}

export const DEFAULT_COLOUR_GRADE: ColourGrade = {
	exposure: 0,
	contrast: 1,
	saturation: 1,
	temperature: 0,
	tint: 0,
	hue: 0,
};

/** The declared parameters, in the order the shader's `params.<name>` reads them. One place: the
 *  scene emit copies the names/types from here, so the WGSL and the payload cannot disagree. */
export const COLOUR_GRADE_PARAMS: AxcutShaderEffectParam[] = [
	{ type: "number", name: "exposure", label: "", default: 0, min: -2, max: 2 },
	{ type: "number", name: "contrast", label: "", default: 1, min: 0.5, max: 1.5 },
	{ type: "number", name: "saturation", label: "", default: 1, min: 0, max: 2 },
	{ type: "number", name: "temperature", label: "", default: 0, min: -100, max: 100 },
	{ type: "number", name: "tint", label: "", default: 0, min: -100, max: 100 },
	{ type: "number", name: "hue", label: "", default: 0, min: -180, max: 180 },
];

/** Identity at the defaults; every axis is a linear operation around it. `frame` is the compositor's
 *  helper for the already-composed picture. */
export const COLOUR_GRADE_WGSL = `fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = frame(uv);
    var rgb = c.rgb;
    rgb = rgb * exp2(params.exposure);
    rgb = (rgb - 0.5) * params.contrast + 0.5;
    let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    rgb = luma + (rgb - luma) * params.saturation;
    let h = params.hue * 0.017453292519943295;
    if (abs(h) > 1e-6) {
        // YIQ hue rotation: luminance stays, the chroma plane turns by h.
        let y = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
        let i = dot(rgb, vec3<f32>(0.596, -0.274, -0.322));
        let q = dot(rgb, vec3<f32>(0.211, -0.523, 0.312));
        let c = cos(h);
        let s = sin(h);
        let i2 = i * c - q * s;
        let q2 = i * s + q * c;
        rgb = vec3<f32>(
            y + 0.956 * i2 + 0.621 * q2,
            y - 0.272 * i2 - 0.647 * q2,
            y - 1.106 * i2 + 1.703 * q2,
        );
    }
    rgb = rgb + vec3<f32>(params.temperature, params.tint, -params.temperature) * 0.01;
    // LUT_APPLY
    return vec4<f32>(rgb, c.a);
}
`;

/** Below the sliders' step: a stored value nearer than this to the default is neutral and no effect
 *  is emitted, so float noise from a round-trip cannot turn on a grade the user never set. */
const NEUTRAL_EPSILON = 0.005;

export function isNeutralColourGrade(grade: ColourGrade): boolean {
	return (
		Math.abs(grade.exposure - DEFAULT_COLOUR_GRADE.exposure) < NEUTRAL_EPSILON &&
		Math.abs(grade.contrast - DEFAULT_COLOUR_GRADE.contrast) < NEUTRAL_EPSILON &&
		Math.abs(grade.saturation - DEFAULT_COLOUR_GRADE.saturation) < NEUTRAL_EPSILON &&
		Math.abs(grade.temperature - DEFAULT_COLOUR_GRADE.temperature) < NEUTRAL_EPSILON &&
		Math.abs(grade.tint - DEFAULT_COLOUR_GRADE.tint) < NEUTRAL_EPSILON &&
		Math.abs(grade.hue - DEFAULT_COLOUR_GRADE.hue) < NEUTRAL_EPSILON
	);
}

export interface ColourPreset {
	id: string;
	grade: ColourGrade;
}

/**
 * A handful of starting looks on the same six axes, so a creator does not have to build one from
 * six neutral controls. Every value stays inside the control's range (the scene bounds it again),
 * and `neutral` is the identity, which emits no effect.
 */
export const COLOUR_PRESETS: ColourPreset[] = [
	{ id: "neutral", grade: { ...DEFAULT_COLOUR_GRADE } },
	{
		id: "warm",
		grade: { exposure: 0.05, contrast: 1.05, saturation: 1.1, temperature: 25, tint: 5, hue: 3 },
	},
	{
		id: "cool",
		grade: { exposure: 0, contrast: 1.05, saturation: 1.05, temperature: -25, tint: -5, hue: -3 },
	},
	{
		id: "cinematic",
		grade: {
			exposure: -0.05,
			contrast: 1.15,
			saturation: 0.9,
			temperature: -10,
			tint: -8,
			hue: -8,
		},
	},
	{
		id: "vivid",
		grade: { exposure: 0.05, contrast: 1.1, saturation: 1.4, temperature: 0, tint: 0, hue: 0 },
	},
	{
		id: "faded",
		grade: { exposure: 0.05, contrast: 0.85, saturation: 0.75, temperature: 5, tint: 0, hue: 4 },
	},
	{
		id: "mono",
		grade: { exposure: 0, contrast: 1.05, saturation: 0, temperature: 0, tint: 0, hue: 0 },
	},
	// Five more looks on the same axes. Each stays inside the slider ranges, so choosing one never
	// writes a value the panel would clamp away.
	{
		id: "golden",
		grade: { exposure: 0.12, contrast: 1.05, saturation: 1.15, temperature: 30, tint: 8, hue: 6 },
	},
	{
		id: "teal",
		grade: {
			exposure: -0.02,
			contrast: 1.18,
			saturation: 1.05,
			temperature: -18,
			tint: 6,
			hue: 10,
		},
	},
	{
		id: "noir",
		grade: { exposure: -0.05, contrast: 1.35, saturation: 0, temperature: -5, tint: 0, hue: 0 },
	},
	{
		id: "pastel",
		grade: { exposure: 0.18, contrast: 0.82, saturation: 1.15, temperature: 8, tint: 4, hue: 2 },
	},
	{
		id: "forest",
		grade: {
			exposure: -0.02,
			contrast: 1.1,
			saturation: 1.1,
			temperature: -12,
			tint: -18,
			hue: -12,
		},
	},
];

const COLOUR_AXES = Object.keys(DEFAULT_COLOUR_GRADE) as Array<keyof ColourGrade>;

/** The preset the grade currently equals (within the neutral epsilon), or null for a custom mix. */
export function matchingColourPreset(grade: ColourGrade): string | null {
	for (const preset of COLOUR_PRESETS) {
		if (COLOUR_AXES.every((axis) => Math.abs(grade[axis] - preset.grade[axis]) < NEUTRAL_EPSILON)) {
			return preset.id;
		}
	}
	return null;
}

/** The effect definition the scene emits when the grade is not neutral or a LUT is active.
 *  `lutStrength` is folded into the same shader, so a LUT is one effect and one cache entry. */
export function colourGradeEffect(
	grade: ColourGrade,
	lut: ColourLut | null = null,
	lutStrength = 0,
): AxcutShaderEffect | null {
	const lutOn = hasColourLut(lut, lutStrength);
	if (isNeutralColourGrade(grade) && !lutOn) return null;
	const apply = lutOn ? "rgb = mix(rgb, fx_lut(rgb), params.lutStrength);" : "";
	const params: AxcutShaderEffectParam[] = [
		...COLOUR_GRADE_PARAMS,
		...(lutOn
			? [
					{
						type: "number" as const,
						name: "lutStrength",
						label: "",
						default: 1,
						min: 0,
						max: 1,
					},
				]
			: []),
	];
	return {
		id: "__colourGrade",
		name: "Colour grade",
		description: "",
		contract: SHADER_EFFECT_CONTRACT,
		code: `${lutOn ? lutShaderBody(lut as ColourLut) : ""}${COLOUR_GRADE_WGSL.replace(
			"    // LUT_APPLY",
			`    ${apply}`,
		)}`,
		params,
		origin: "user",
	};
}
