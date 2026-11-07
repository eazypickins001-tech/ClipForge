// A global colour grade: the five moves people reach for — exposure, contrast, saturation,
// temperature and tint — applied to the whole programme as one fixed WGSL effect.
//
// It rides the AGENT shader-effect pipeline (`crates/compositor/src/shader_fx.rs`): the compositor
// already compiles and runs `fn effect(uv) -> vec4` per frame on all three backends, so a colour
// grade is just a shader whose parameters are the five sliders. No new Rust pass, no new scene
// struct. `frame(uv)` reads the composed picture (footage + webcam + background), which is the
// "filter over the whole frame" look this ships; a footage-only grade (via `footage()`) is a later
// refinement, not this slice.
//
// Neutral means "no grade": the shader is the identity at the defaults, and `colourGradeEffect`
// returns null for it, so a project that never touches colour emits exactly the payload it always
// did.

import type { AxcutShaderEffect, AxcutShaderEffectParam } from "./schema";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";

export interface ColourGrade {
	exposure: number;
	contrast: number;
	saturation: number;
	temperature: number;
	tint: number;
}

export const DEFAULT_COLOUR_GRADE: ColourGrade = {
	exposure: 0,
	contrast: 1,
	saturation: 1,
	temperature: 0,
	tint: 0,
};

/** The declared parameters, in the order the shader's `params.<name>` reads them. One place: the
 *  scene emit copies the names/types from here, so the WGSL and the payload cannot disagree. */
export const COLOUR_GRADE_PARAMS: AxcutShaderEffectParam[] = [
	{ type: "number", name: "exposure", label: "", default: 0, min: -2, max: 2 },
	{ type: "number", name: "contrast", label: "", default: 1, min: 0.5, max: 1.5 },
	{ type: "number", name: "saturation", label: "", default: 1, min: 0, max: 2 },
	{ type: "number", name: "temperature", label: "", default: 0, min: -100, max: 100 },
	{ type: "number", name: "tint", label: "", default: 0, min: -100, max: 100 },
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
    rgb = rgb + vec3<f32>(params.temperature, params.tint, -params.temperature) * 0.01;
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
		Math.abs(grade.tint - DEFAULT_COLOUR_GRADE.tint) < NEUTRAL_EPSILON
	);
}

/** The effect definition the scene emits when the grade is not neutral, else null. */
export function colourGradeEffect(grade: ColourGrade): AxcutShaderEffect | null {
	if (isNeutralColourGrade(grade)) return null;
	return {
		id: "__colourGrade",
		name: "Colour grade",
		description: "",
		contract: SHADER_EFFECT_CONTRACT,
		code: COLOUR_GRADE_WGSL,
		params: COLOUR_GRADE_PARAMS,
		origin: "user",
	};
}
