// F8's transform panel: the clip screen's scale and position over time.
//
// Three independent key tracks, each edited like opacity's: the slider commits on release (one
// write), and the key button CAPTURES the value at the playhead. `at` is source-normalised, so
// splitting/trimming retimes the tracks through the same helpers opacity uses.
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type ClipTransformTrack } from "@/lib/ai-edition/document/timeline";
import type { AxcutClip, AxcutClipPropertyKey } from "@/lib/ai-edition/schema";
import { moveKey, opacityKeyAtFor, setKeyEasing } from "@/lib/ai-edition/timeline/opacityKeyframes";
import { type SpeedRegion, screenTimeMs, timelineTimeMs } from "@/lib/ai-edition/timeline/speed";
import {
	removeTransformKey,
	sampleTransformValue,
	setTransformKey,
	TRANSFORM_POSITION_MAX,
	TRANSFORM_POSITION_MIN,
	TRANSFORM_SCALE_MAX,
	TRANSFORM_SCALE_MIN,
} from "@/lib/ai-edition/timeline/transformKeyframes";
import { KeyEasingControl } from "./KeyEasingControl";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

const PERCENT = 100;

function TransformTrack({
	track,
	label,
	keys,
	at,
	min,
	max,
	fallback,
	onWrite,
	onSeekToKey,
}: {
	track: ClipTransformTrack;
	label: string;
	keys: AxcutClipPropertyKey[];
	at: number | null;
	min: number;
	max: number;
	fallback: number;
	onWrite: (track: ClipTransformTrack, keys: AxcutClipPropertyKey[]) => void;
	onSeekToKey: (keyAt: number) => void;
}) {
	const t = useScopedT("settings");
	const [live, setLive] = useState<number | null>(null);
	const value = live ?? sampleTransformValue(keys, at ?? 0, fallback, min, max);
	const add = () => {
		if (at === null) return;
		onWrite(track, setTransformKey(keys, at, value, min, max));
	};
	return (
		<div style={{ marginTop: 14 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<div style={{ flex: 1 }}>
					<SliderCell
						label={label}
						value={Math.round(value * PERCENT)}
						min={Math.round(min * PERCENT)}
						max={Math.round(max * PERCENT)}
						step={1}
						decimals={0}
						suffix="%"
						showValue
						onChange={(next) => setLive(next / PERCENT)}
						onCommit={() => {
							if (at !== null && live !== null) {
								onWrite(track, setTransformKey(keys, at, live, min, max));
							}
							setLive(null);
						}}
					/>
				</div>
				<button
					type="button"
					disabled={at === null}
					onClick={add}
					data-testid={`transform-add-${track}`}
				>
					{t("transform.add")}
				</button>
			</div>
			{keys.length > 0 && (
				<>
					<ul
						data-testid={`transform-keys-${track}`}
						style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}
					>
						{keys.map((key) => (
							<li
								key={key.at}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "3px 0",
									borderBottom: "1px solid rgba(255,255,255,0.08)",
								}}
							>
								<input
									type="number"
									min={0}
									max={100}
									step={1}
									aria-label={t("transform.keyPosition")}
									defaultValue={Math.round(key.at * 100)}
									onKeyDown={(event) => {
										if (event.key === "Enter") event.currentTarget.blur();
									}}
									onBlur={(event) => {
										const pct = Number(event.target.value);
										if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
											const nextAt = pct / 100;
											if (Math.abs(nextAt - key.at) > 1e-6) {
												onWrite(track, moveKey(keys, key.at, nextAt));
											}
										} else {
											event.target.value = String(Math.round(key.at * 100));
										}
									}}
									style={{ width: 54 }}
								/>
								<span style={{ marginLeft: 4 }}>%</span>
								<span style={{ marginLeft: 8, opacity: 0.75 }}>
									{Math.round(key.value * PERCENT)}%
								</span>
								<button
									type="button"
									aria-label={t("transform.goToKey")}
									onClick={() => onSeekToKey(key.at)}
									style={{ marginLeft: "auto", marginRight: 4 }}
								>
									→
								</button>
								<span style={{ marginLeft: 8, marginRight: 8 }}>
									<KeyEasingControl
										value={key.easing}
										onChange={(easing) => onWrite(track, setKeyEasing(keys, key.at, easing))}
									/>
								</span>
								<button
									type="button"
									aria-label={t("transform.remove")}
									onClick={() => onWrite(track, removeTransformKey(keys, key.at))}
								>
									×
								</button>
							</li>
						))}
					</ul>
					<button
						type="button"
						onClick={() => onWrite(track, [])}
						data-testid={`transform-clear-${track}`}
						style={{ marginTop: 6 }}
					>
						{t("transform.clear")}
					</button>
				</>
			)}
		</div>
	);
}

export function ClipTransformModal({
	open,
	onClose,
	clip,
	playheadSec,
	speedRegions,
	onChange,
	onSeek,
}: {
	open: boolean;
	onClose: () => void;
	clip: AxcutClip | null;
	playheadSec: number;
	speedRegions: readonly SpeedRegion[];
	onChange: (track: ClipTransformTrack, keys: AxcutClipPropertyKey[]) => void;
	onSeek?: (sec: number) => void;
}) {
	const t = useScopedT("settings");
	const tc = useScopedT("common");
	const [keys, setKeys] = useState<Record<ClipTransformTrack, AxcutClipPropertyKey[]>>({
		scale: clip?.scaleKeys ?? [],
		x: clip?.positionXKeys ?? [],
		y: clip?.positionYKeys ?? [],
	});
	const clipId = clip?.id ?? null;
	// The panel writes WHOLE lists, so it owns them while open: a second capture must not read
	// the snapshot taken at open. A reopen reseeds from the document.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clipId is the trigger; `clip` is the value it selects.
	useEffect(() => {
		setKeys({
			scale: clip?.scaleKeys ?? [],
			x: clip?.positionXKeys ?? [],
			y: clip?.positionYKeys ?? [],
		});
	}, [clipId]);

	if (!clip) return null;
	const write = (track: ClipTransformTrack, next: AxcutClipPropertyKey[]) => {
		setKeys((current) => ({ ...current, [track]: next }));
		onChange(track, next);
	};
	const sourceSec = screenTimeMs(speedRegions, playheadSec * 1000) / 1000;
	const at = opacityKeyAtFor(clip, sourceSec);
	const seekToKey = (keyAt: number) => {
		const end = clip.sourceEndSec;
		if (!onSeek || end === undefined) return;
		const source = clip.sourceStartSec + keyAt * (end - clip.sourceStartSec);
		onSeek(timelineTimeMs(speedRegions, source * 1000) / 1000);
	};

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title={t("transform.title")}
			footer={
				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<button type="button" onClick={onClose} data-testid="clip-transform-done">
						{tc("actions.close")}
					</button>
				</div>
			}
		>
			<p style={{ margin: "0 0 4px", opacity: 0.75, fontSize: 12 }}>
				{at === null ? t("transform.outside") : t("transform.hint")}
			</p>
			<TransformTrack
				track="scale"
				label={t("transform.scale")}
				keys={keys.scale}
				at={at}
				min={TRANSFORM_SCALE_MIN}
				max={TRANSFORM_SCALE_MAX}
				fallback={1}
				onWrite={write}
				onSeekToKey={seekToKey}
			/>
			<TransformTrack
				track="x"
				label={t("transform.positionX")}
				keys={keys.x}
				at={at}
				min={TRANSFORM_POSITION_MIN}
				max={TRANSFORM_POSITION_MAX}
				fallback={0}
				onWrite={write}
				onSeekToKey={seekToKey}
			/>
			<TransformTrack
				track="y"
				label={t("transform.positionY")}
				keys={keys.y}
				at={at}
				min={TRANSFORM_POSITION_MIN}
				max={TRANSFORM_POSITION_MAX}
				fallback={0}
				onWrite={write}
				onSeekToKey={seekToKey}
			/>
		</ModalShell>
	);
}
