// The per-key easing control: the four named easings, or a custom cubic-bezier edited on a small
// graph. Shared by the Opacity and Volume panels so the options and the curve semantics cannot
// drift apart.
//
// The curve editor drags two handles on a 0..1 box and commits ON POINTER UP: a drag is one write
// and one undo step, the same contract as the sliders. Bisection on x(u) (see `opacityKeyframes`)
// is the sampler both the compositor and the mixer read.
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import type { AxcutBezierEasing, AxcutEasing } from "@/lib/ai-edition/schema";
import { KEY_EASINGS } from "@/lib/ai-edition/timeline/opacityKeyframes";

/** Selecting "custom" starts from a symmetric curve that is close to ease-in-out. */
const DEFAULT_BEZIER: AxcutBezierEasing = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

type NamedEasing = (typeof KEY_EASINGS)[number];

export function KeyEasingControl({
	value,
	onChange,
}: {
	value?: AxcutEasing;
	onChange: (easing: AxcutEasing) => void;
}) {
	const t = useScopedT("settings");
	const [open, setOpen] = useState(false);
	const custom = typeof value === "object";
	const selected = custom ? "custom" : (value ?? "linear");

	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
			<select
				aria-label={t("keyframeEasing.label")}
				value={selected}
				onChange={(event) => {
					const next = event.target.value;
					onChange(next === "custom" ? DEFAULT_BEZIER : (next as NamedEasing));
				}}
			>
				{KEY_EASINGS.map((easing) => (
					<option key={easing} value={easing}>
						{t(
							easing === "linear"
								? "keyframeEasing.linear"
								: easing === "ease-in"
									? "keyframeEasing.easeIn"
									: easing === "ease-out"
										? "keyframeEasing.easeOut"
										: "keyframeEasing.easeInOut",
						)}
					</option>
				))}
				<option value="custom">{t("keyframeEasing.custom")}</option>
			</select>
			{custom && (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t("keyframeEasing.curve")}
							title={t("keyframeEasing.curve")}
							style={{ padding: "0 4px" }}
						>
							∿
						</button>
					</PopoverTrigger>
					<PopoverContent side="top" align="end" style={{ width: "auto", padding: 10 }}>
						<EasingCurveEditor value={value as AxcutBezierEasing} onCommit={onChange} />
					</PopoverContent>
				</Popover>
			)}
		</span>
	);
}

function EasingCurveEditor({
	value,
	onCommit,
}: {
	value: AxcutBezierEasing;
	onCommit: (easing: AxcutBezierEasing) => void;
}) {
	const t = useScopedT("settings");
	const svgRef = useRef<SVGSVGElement>(null);
	const [draft, setDraft] = useState(value);
	const draftRef = useRef(value);
	const [drag, setDrag] = useState<"one" | "two" | null>(null);

	useEffect(() => {
		setDraft(value);
		draftRef.current = value;
	}, [value]);

	const SIZE = 140;
	const PAD = 12;
	const toPx = (x: number, y: number): [number, number] => [
		PAD + x * (SIZE - 2 * PAD),
		SIZE - PAD - y * (SIZE - 2 * PAD),
	];
	const fromClient = (clientX: number, clientY: number) => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
		const gx = (clientX - rect.left) * (SIZE / rect.width);
		const gy = (clientY - rect.top) * (SIZE / rect.height);
		return {
			x: Math.min(1, Math.max(0, (gx - PAD) / (SIZE - 2 * PAD))),
			y: Math.min(1, Math.max(0, (SIZE - PAD - gy) / (SIZE - 2 * PAD))),
		};
	};
	const move = (clientX: number, clientY: number) => {
		if (!drag) return;
		const point = fromClient(clientX, clientY);
		const next =
			drag === "one"
				? { ...draftRef.current, x1: point.x, y1: point.y }
				: { ...draftRef.current, x2: point.x, y2: point.y };
		draftRef.current = next;
		setDraft(next);
	};
	const end = () => {
		if (!drag) return;
		onCommit(draftRef.current);
		setDrag(null);
	};

	const [startX, startY] = toPx(0, 0);
	const [endX, endY] = toPx(1, 1);
	const [oneX, oneY] = toPx(draft.x1, draft.y1);
	const [twoX, twoY] = toPx(draft.x2, draft.y2);

	return (
		<div>
			<svg
				ref={svgRef}
				width={SIZE}
				height={SIZE}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				role="img"
				aria-label={t("keyframeEasing.curve")}
				style={{ touchAction: "none", display: "block", cursor: "crosshair" }}
				onPointerMove={(event) => move(event.clientX, event.clientY)}
				onPointerUp={end}
				onPointerCancel={end}
			>
				<line
					x1={startX}
					y1={startY}
					x2={endX}
					y2={endY}
					stroke="rgba(255,255,255,0.18)"
					strokeDasharray="3 3"
				/>
				<path
					d={`M ${startX} ${startY} C ${oneX} ${oneY}, ${twoX} ${twoY}, ${endX} ${endY}`}
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
				/>
				<circle
					cx={oneX}
					cy={oneY}
					r={7}
					fill="hsl(var(--primary))"
					onPointerDown={(event) => {
						svgRef.current?.setPointerCapture(event.pointerId);
						setDrag("one");
					}}
				/>
				<circle
					cx={twoX}
					cy={twoY}
					r={7}
					fill="hsl(var(--primary))"
					onPointerDown={(event) => {
						svgRef.current?.setPointerCapture(event.pointerId);
						setDrag("two");
					}}
				/>
			</svg>
			<p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.7 }}>
				cubic-bezier({draft.x1.toFixed(2)}, {draft.y1.toFixed(2)}, {draft.x2.toFixed(2)},{" "}
				{draft.y2.toFixed(2)})
			</p>
		</div>
	);
}
