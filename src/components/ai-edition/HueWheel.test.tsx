// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HueWheel } from "./HueWheel";

function rect(): DOMRect {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: 100,
		bottom: 100,
		width: 100,
		height: 100,
		toJSON: () => ({}),
	} as DOMRect;
}

describe("HueWheel", () => {
	it("turns by pointer angle and commits on release", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		render(<HueWheel label="Hue" value={0} onChange={onChange} onCommit={onCommit} />);
		const wheel = screen.getByRole("slider", { name: "Hue" });
		vi.spyOn(wheel, "getBoundingClientRect").mockReturnValue(rect());

		fireEvent.pointerDown(wheel, { clientX: 50, clientY: 0, pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(0);
		fireEvent.pointerMove(wheel, { clientX: 100, clientY: 50, pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(90);
		fireEvent.pointerMove(wheel, { clientX: 0, clientY: 50, pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(-90);
		expect(onCommit).not.toHaveBeenCalled();
		fireEvent.pointerUp(wheel, { pointerId: 1 });
		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	it("moves by keyboard, with a coarser step when shifted", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		render(<HueWheel label="Hue" value={0} onChange={onChange} onCommit={onCommit} />);
		const wheel = screen.getByRole("slider", { name: "Hue" });

		fireEvent.keyDown(wheel, { key: "ArrowRight" });
		expect(onChange).toHaveBeenLastCalledWith(5);
		fireEvent.keyDown(wheel, { key: "ArrowRight", shiftKey: true });
		expect(onChange).toHaveBeenLastCalledWith(15);
		fireEvent.keyDown(wheel, { key: "Home" });
		expect(onChange).toHaveBeenLastCalledWith(-180);
		fireEvent.keyDown(wheel, { key: "End" });
		expect(onChange).toHaveBeenLastCalledWith(180);
		expect(onCommit).toHaveBeenCalledTimes(4);
	});

	it("ignores input when disabled", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		render(<HueWheel label="Hue" value={0} disabled onChange={onChange} onCommit={onCommit} />);
		const wheel = screen.getByRole("slider", { name: "Hue" });
		fireEvent.keyDown(wheel, { key: "ArrowRight" });
		expect(onChange).not.toHaveBeenCalled();
		expect(onCommit).not.toHaveBeenCalled();
	});
});
