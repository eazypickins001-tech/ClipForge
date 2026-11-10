// A global vignette: one fixed WGSL effect over the whole frame, a curated entry in the effects
// library rather than a code box.
//
// It is the same shape as the colour grade (`colourGrade.ts`): the compositor already compiles and
// runs `fn effect(uv) -> vec4` per frame on all three backends, so this is one shader with one
// parameter and no new Rust pass. Neutral (amount 0) returns null, so a project that never uses it
// emits exactly the payload it did before.

import type { AxcutShaderEffect, AxcutShaderEffectParam } from "./schema";
import { SHADER_EFFECT_CONTRACT } from "./shaderEffects";

export interface Vignette {
	/** 0 = none, 1 = the corners go fully dark. */
	amount: number;
}

export const DEFAULT_VIGNETTE: Vignette = { amount: 0 };

/** Below this the effect is indistinguishable from none, and emitting it would only add a pass. */
const VIGNETTE_EPSILON = 0.01;

/** The one declared parameter, in the order the shader reads it. */
export const VIGNETTE_PARAMS: AxcutShaderEffectParam[] = [
	{ type: "number", name: "amount", label: "", default: 0, min: 0, max: 1 },
];

/** Darkens the frame toward its corners; `uv` is the full-frame coordinate. */
export const VIGNETTE_WGSL = `fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = frame(uv);
    let d = distance(uv, vec2<f32>(0.5, 0.5)) * 1.41421356;
    let falloff = smoothstep(0.35, 1.0, d);
    let shade = 1.0 - params.amount * falloff;
    return vec4<f32>(c.rgb * shade, c.a);
}
`;

export function isNeutralVignette(vignette: Vignette): boolean {
	return !(vignette.amount > VIGNETTE_EPSILON);
}

/** The effect definition the scene emits when the vignette is on, else null. */
export function vignetteEffect(vignette: Vignette): AxcutShaderEffect | null {
	if (isNeutralVignette(vignette)) return null;
	return {
		id: "__vignette",
		name: "Vignette",
		description: "",
		contract: SHADER_EFFECT_CONTRACT,
		code: VIGNETTE_WGSL,
		params: VIGNETTE_PARAMS,
		origin: "user",
	};
}
