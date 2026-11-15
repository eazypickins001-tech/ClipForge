// A hue wheel: the colour-grade hue axis as an angle, not a number. Pointer drags and arrow keys
// both write it; the pane's `setLive`/`commit` pair keeps a drag to one write.
import { useRef, useState } from "react";

const SIZE = 104;
const DOT_RADIUS = 36;
const MIN = -180;
const MAX = 180;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

export function HueWheel({
	label,
	value,
	disabled,
	onChange,
	onCommit,
}: {
	label: string;
	value: number;
	disabled?: boolean;
	onChange: (hue: number) => void;
	onCommit: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [live, setLive] = useState<number | null>(null);
	const hue = live ?? value;

	const updateFrom = (clientX: number, clientY: number) => {
		const rect = ref.current?.getBoundingClientRect();
		if (!rect) return;
		const dx = clientX - (rect.left + rect.width / 2);
		const dy = clientY - (rect.top + rect.height / 2);
		// 0° is up and the wheel runs clockwise, like conic-gradient's `from 0deg`.
		const next = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
		setLive(next);
		onChange(next);
	};

	const end = () => {
		if (live === null) return;
		onCommit();
		setLive(null);
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (disabled) return;
		const step = event.shiftKey ? 15 : 5;
		let next: number | null = null;
		if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step;
		else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step;
		else if (event.key === "PageDown") next = value - 30;
		else if (event.key === "PageUp") next = value + 30;
		else if (event.key === "Home") next = MIN;
		else if (event.key === "End") next = MAX;
		if (next === null) return;
		event.preventDefault();
		onChange(clamp(next));
		onCommit();
	};

	return (
		<div
			ref={ref}
			role="slider"
			tabIndex={disabled ? -1 : 0}
			aria-label={label}
			aria-valuemin={MIN}
			aria-valuemax={MAX}
			aria-valuenow={Math.round(hue)}
			aria-disabled={disabled || undefined}
			onPointerDown={(event) => {
				if (disabled) return;
				event.currentTarget.setPointerCapture?.(event.pointerId);
				updateFrom(event.clientX, event.clientY);
			}}
			onPointerMove={(event) => {
				if (live !== null) updateFrom(event.clientX, event.clientY);
			}}
			onPointerUp={end}
			onPointerCancel={end}
			onKeyDown={onKeyDown}
			style={{
				width: SIZE,
				height: SIZE,
				borderRadius: "50%",
				position: "relative",
				flex: "0 0 auto",
				touchAction: "none",
				cursor: disabled ? "default" : "crosshair",
				opacity: disabled ? 0.5 : 1,
				background:
					"conic-gradient(from 0deg, #ff3b30, #ffcc00, #34c759, #32d4e0, #0a84ff, #bf5af2, #ff3b30)",
				boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
			}}
		>
			<div
				aria-hidden
				style={{
					position: "absolute",
					left: "50%",
					top: "50%",
					width: 12,
					height: 12,
					marginLeft: -6,
					marginTop: -6,
					borderRadius: "50%",
					background: "#ffffff",
					border: "2px solid #000000",
					boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
					transform: `rotate(${hue}deg) translateY(-${DOT_RADIUS}px)`,
				}}
			/>
		</div>
	);
}
