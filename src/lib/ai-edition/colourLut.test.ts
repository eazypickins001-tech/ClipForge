import { describe, expect, it } from "vitest";
import {
	type ColourLut,
	colourLutSettings,
	hasColourLut,
	importCubeLut,
	LUT_ENTRIES,
	LUT_GRID,
	LUT_VALUES,
	lutShaderBody,
	parseCubeLut,
	readColourLut,
	resampleCubeLut,
} from "./colourLut";
import { createEmptyDocument } from "./schema";
import { patchEditorSettings } from "./store/editorSettings";

const CUBE = `TITLE "Test"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

const lut = (): ColourLut => ({ name: "x", data: new Array(LUT_VALUES).fill(0.5) });

describe("parseCubeLut", () => {
	it("reads a 3D cube, red changing fastest", () => {
		const parsed = parseCubeLut(CUBE);
		expect(parsed.size).toBe(2);
		expect(parsed.data).toHaveLength(24);
		expect(parsed.data.slice(0, 3)).toEqual([0, 0, 0]);
		expect(parsed.data.slice(3, 6)).toEqual([1, 0, 0]);
		expect(parsed.data.slice(-3)).toEqual([1, 1, 1]);
	});

	it("normalises DOMAIN_MIN/MAX", () => {
		const parsed = parseCubeLut(
			`LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n` +
				`2 2 2\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n`,
		);
		expect(parsed.data.slice(0, 3)).toEqual([1, 1, 1]);
	});

	it("refuses 1D, missing sizes, malformed rows and wrong counts", () => {
		expect(() => parseCubeLut("LUT_1D_SIZE 2\n0 0 0\n1 1 1\n")).toThrow(/1D/);
		expect(() => parseCubeLut("0 0 0\n")).toThrow(/LUT_3D_SIZE/);
		expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0\n")).toThrow(/Malformed/);
		expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")).toThrow(/Expected 8 rows/);
		expect(() => parseCubeLut("LUT_3D_SIZE 1\n0 0 0\n")).toThrow(/LUT_3D_SIZE/);
	});
});

describe("resampleCubeLut", () => {
	it("resamples to 9³ and preserves the corners and midpoints of a linear cube", () => {
		const imported = importCubeLut(CUBE, "Test");
		expect(imported.data).toHaveLength(LUT_VALUES);
		const at = (r: number, g: number, b: number) => {
			const base = ((b * LUT_GRID + g) * LUT_GRID + r) * 3;
			return imported.data.slice(base, base + 3);
		};
		expect(at(0, 0, 0)).toEqual([0, 0, 0]);
		expect(at(LUT_GRID - 1, LUT_GRID - 1, LUT_GRID - 1)).toEqual([1, 1, 1]);
		expect(at(4, 4, 4)).toEqual([0.5, 0.5, 0.5]);
	});

	it("matches a size-9 source exactly", () => {
		const data = Array.from({ length: LUT_VALUES }, (_, i) => (i % 3) / 2);
		const source = { size: 9, data };
		expect(resampleCubeLut(source).data).toEqual(data);
	});
});

describe("stored LUTs", () => {
	it("reads only a complete finite table, clamped", () => {
		expect(readColourLut(new Array(LUT_VALUES).fill(2))).toEqual(new Array(LUT_VALUES).fill(1));
		expect(readColourLut(new Array(LUT_VALUES - 1).fill(0))).toBeNull();
		expect(readColourLut([...new Array(LUT_VALUES - 1).fill(0), "x"])).toBeNull();
		expect(readColourLut("nope")).toBeNull();
	});

	it("reads a document's LUT, name and strength", () => {
		const data = new Array(LUT_VALUES).fill(0.25);
		expect(
			colourLutSettings({
				legacyEditor: { colourLut: data, colourLutName: "Kodak", colourLutStrength: 0.6 },
			}),
		).toEqual({ lut: { name: "Kodak", data: expect.any(Array) }, strength: 0.6, name: "Kodak" });
		expect(colourLutSettings({ legacyEditor: { colourLutName: "Broken" } }).lut).toBeNull();
	});

	it("writes and clears the table through the settings patch in one write", () => {
		const data = new Array(LUT_VALUES).fill(0.4);
		const doc = patchEditorSettings(createEmptyDocument({ projectId: "p", title: "L" }), {
			colourLut: data,
			colourLutName: "Look",
			colourLutStrength: 0.6,
		});
		expect(colourLutSettings(doc)).toMatchObject({
			name: "Look",
			strength: 0.6,
			lut: { name: "Look" },
		});
		const cleared = patchEditorSettings(doc, {
			colourLut: null,
			colourLutName: null,
			colourLutStrength: 0,
		});
		expect(colourLutSettings(cleared).lut).toBeNull();
	});
});

describe("lutShaderBody", () => {
	it("emits the 9³ table and the trilinear sampler", () => {
		const body = lutShaderBody(lut());
		expect(body).toContain(`array<vec3<f32>, ${LUT_ENTRIES}>`);
		expect(body).toContain("fn fx_lut(rgb: vec3<f32>)");
		expect(body).toContain("fn fx_lut_index");
		const table = body.slice(body.indexOf("const fx_lut_table"), body.indexOf("\n);"));
		expect(table.match(/vec3<f32>\(/g)).toHaveLength(LUT_ENTRIES);
	});

	it("is off at zero strength", () => {
		expect(hasColourLut(lut(), 0)).toBe(false);
		expect(hasColourLut(lut(), 0.5)).toBe(true);
		expect(hasColourLut(null, 1)).toBe(false);
	});
});
