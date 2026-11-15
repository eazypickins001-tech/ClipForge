// Imported 3D LUTs, as the colour-grade shader consumes them.
//
// A `.cube` file maps RGB to RGB on a 3D grid. The grade shader is generated TS, so instead of
// adding a texture binding to the effect contract (which every backend would have to bind), the
// grid is resampled to 9³ and emitted as WGSL constants. That keeps a LUT on the same fixed-shader
// path as the grade, compiling for every backend without native changes; the compile is cached by
// the compositor's effect cache like any other shader.
//
// 9³ is 729 entries, ~20 KB of source: enough to hold a graded look without a texture fetch, small
// enough to generate per LUT rather than per frame.

export const LUT_GRID = 9;
export const LUT_ENTRIES = LUT_GRID ** 3;
export const LUT_VALUES = LUT_ENTRIES * 3;
/** A `.cube` larger than this is not a look, it is a mistake; 64³ is already 262k entries. */
export const LUT_SOURCE_MAX = 64;
/** Redistributing a 64³ table is fine once; cap the text so a stray file cannot stall import. */
const CUBE_TEXT_MAX = 8 * 1024 * 1024;

export interface ColourLut {
	name: string;
	/** RGB triples, red fastest, then green, then blue; each 0..1. Always `LUT_GRID` cubed. */
	data: number[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function readTriple(line: string): [number, number, number] | null {
	const parts = line.trim().split(/\s+/);
	if (parts.length !== 3) return null;
	const values = parts.map(Number);
	if (values.some((value) => !Number.isFinite(value))) return null;
	return [values[0], values[1], values[2]];
}

/**
 * A `.cube` 3D LUT: `LUT_3D_SIZE n`, optional `DOMAIN_MIN`/`DOMAIN_MAX`, then n³ RGB rows, red
 * changing fastest. 1D LUTs are refused — the grade is a 3D table.
 */
export function parseCubeLut(text: string): { size: number; data: number[] } {
	if (typeof text !== "string" || text.length === 0) throw new Error("The LUT file is empty.");
	if (text.length > CUBE_TEXT_MAX) throw new Error("The LUT file is too large.");
	let size = 0;
	let min = [0, 0, 0];
	let max = [1, 1, 1];
	const rows: number[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("TITLE")) continue;
		if (line.startsWith("LUT_1D_SIZE"))
			throw new Error("1D LUTs are not supported; use a 3D .cube.");
		if (line.startsWith("LUT_3D_SIZE")) {
			const parsed = Number(line.slice("LUT_3D_SIZE".length).trim());
			if (!Number.isInteger(parsed) || parsed < 2 || parsed > LUT_SOURCE_MAX) {
				throw new Error(`Unsupported LUT_3D_SIZE (expected 2..${LUT_SOURCE_MAX}).`);
			}
			size = parsed;
			continue;
		}
		if (line.startsWith("DOMAIN_MIN")) {
			const triple = readTriple(line.slice("DOMAIN_MIN".length));
			if (!triple) throw new Error("Malformed DOMAIN_MIN.");
			min = triple;
			continue;
		}
		if (line.startsWith("DOMAIN_MAX")) {
			const triple = readTriple(line.slice("DOMAIN_MAX".length));
			if (!triple) throw new Error("Malformed DOMAIN_MAX.");
			max = triple;
			continue;
		}
		const triple = readTriple(line);
		if (!triple) throw new Error(`Malformed LUT row: ${line.slice(0, 40)}`);
		rows.push(...triple);
	}
	if (!size) throw new Error("The file has no LUT_3D_SIZE line.");
	if (rows.length !== size ** 3 * 3) {
		throw new Error(`Expected ${size ** 3} rows, found ${rows.length / 3}.`);
	}
	if (max.some((value, index) => value <= min[index])) {
		throw new Error("DOMAIN_MAX must be above DOMAIN_MIN.");
	}
	return {
		size,
		data: rows.map((value, index) => {
			const channel = index % 3;
			const span = max[channel] - min[channel];
			return clamp01((value - min[channel]) / span);
		}),
	};
}

/** Trilinear sample of a size³ table at (r, g, b), each 0..1. */
function sampleTable(
	data: number[],
	size: number,
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	const at = (x: number, y: number, z: number) => {
		const base = ((z * size + y) * size + x) * 3;
		return [data[base], data[base + 1], data[base + 2]] as [number, number, number];
	};
	const p = [clamp01(r) * (size - 1), clamp01(g) * (size - 1), clamp01(b) * (size - 1)];
	const i = p.map(Math.floor);
	const f = p.map((value, index) => value - i[index]);
	const i1 = i.map((value) => Math.min(size - 1, value + 1));
	const mix = (a: number, b: number, t: number) => a + (b - a) * t;
	const out: [number, number, number] = [0, 0, 0];
	for (let channel = 0; channel < 3; channel++) {
		const c000 = at(i[0], i[1], i[2])[channel];
		const c100 = at(i1[0], i[1], i[2])[channel];
		const c010 = at(i[0], i1[1], i[2])[channel];
		const c110 = at(i1[0], i1[1], i[2])[channel];
		const c001 = at(i[0], i[1], i1[2])[channel];
		const c101 = at(i1[0], i[1], i1[2])[channel];
		const c011 = at(i[0], i1[1], i1[2])[channel];
		const c111 = at(i1[0], i1[1], i1[2])[channel];
		const c00 = mix(c000, c100, f[0]);
		const c10 = mix(c010, c110, f[0]);
		const c01 = mix(c001, c101, f[0]);
		const c11 = mix(c011, c111, f[0]);
		out[channel] = mix(mix(c00, c10, f[1]), mix(c01, c11, f[1]), f[2]);
	}
	return out;
}

/** A parsed table resampled to the shader's fixed 9³ grid. */
export function resampleCubeLut(
	parsed: { size: number; data: number[] },
	name = "Imported LUT",
): ColourLut {
	const data: number[] = [];
	for (let b = 0; b < LUT_GRID; b++) {
		for (let g = 0; g < LUT_GRID; g++) {
			for (let r = 0; r < LUT_GRID; r++) {
				data.push(
					...sampleTable(
						parsed.data,
						parsed.size,
						r / (LUT_GRID - 1),
						g / (LUT_GRID - 1),
						b / (LUT_GRID - 1),
					),
				);
			}
		}
	}
	return { name, data };
}

export function importCubeLut(text: string, name: string): ColourLut {
	return resampleCubeLut(parseCubeLut(text), name);
}

/** A stored table, read back: only a complete, finite 9³ RGB table is one. */
export function readColourLut(data: unknown): number[] | null {
	if (!Array.isArray(data) || data.length !== LUT_VALUES) return null;
	const out: number[] = [];
	for (const value of data) {
		if (typeof value !== "number" || !Number.isFinite(value)) return null;
		out.push(clamp01(value));
	}
	return out;
}

/** Below this the LUT is off; the slider's step is 0.01. */
export const LUT_NEUTRAL_EPSILON = 0.005;

export function lutStrengthFrom(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : 0;
}

export function hasColourLut(lut: ColourLut | null, strength: number): lut is ColourLut {
	return lut !== null && strength > LUT_NEUTRAL_EPSILON;
}

function legacyRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** The LUT a document carries, read back: a stored 9³ table, its name, and its strength. */
export function colourLutSettings(document: { legacyEditor?: unknown }): {
	lut: ColourLut | null;
	strength: number;
	name: string | null;
} {
	const legacy = legacyRecord(document.legacyEditor);
	const data = readColourLut(legacy.colourLut);
	const name = typeof legacy.colourLutName === "string" ? legacy.colourLutName : null;
	return {
		lut: data ? { name: name ?? "Imported LUT", data } : null,
		strength: lutStrengthFrom(legacy.colourLutStrength),
		name,
	};
}

/**
 * The WGSL a LUT contributes: a 9³ constant table, a trilinear `fx_lut`, and the table itself.
 * Empty when there is no LUT, so a project without one generates exactly the old shader.
 */
export function lutShaderBody(lut: ColourLut): string {
	const values = lut.data.map((value) => value.toFixed(5));
	const entries: string[] = [];
	for (let i = 0; i < values.length; i += 3) {
		entries.push(`vec3<f32>(${values[i]}, ${values[i + 1]}, ${values[i + 2]})`);
	}
	return `const fx_lut_table = array<vec3<f32>, ${LUT_ENTRIES}>(\n    ${entries.join(",\n    ")}\n);
fn fx_lut_index(r: i32, g: i32, b: i32) -> vec3<f32> {
    return fx_lut_table[(b * ${LUT_GRID} + g) * ${LUT_GRID} + r];
}
fn fx_lut(rgb: vec3<f32>) -> vec3<f32> {
    let p = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * ${LUT_GRID - 1}.0;
    let i = vec3<i32>(floor(p));
    let f = p - vec3<f32>(i);
    let i1 = min(i + vec3<i32>(1), vec3<i32>(${LUT_GRID - 1}));
    let c000 = fx_lut_index(i.x, i.y, i.z);
    let c100 = fx_lut_index(i1.x, i.y, i.z);
    let c010 = fx_lut_index(i.x, i1.y, i.z);
    let c110 = fx_lut_index(i1.x, i1.y, i.z);
    let c001 = fx_lut_index(i.x, i.y, i1.z);
    let c101 = fx_lut_index(i1.x, i.y, i1.z);
    let c011 = fx_lut_index(i.x, i1.y, i1.z);
    let c111 = fx_lut_index(i1.x, i1.y, i1.z);
    let c00 = mix(c000, c100, f.x);
    let c10 = mix(c010, c110, f.x);
    let c01 = mix(c001, c101, f.x);
    let c11 = mix(c011, c111, f.x);
    return mix(mix(c00, c10, f.y), mix(c01, c11, f.y), f.z);
}
`;
}
