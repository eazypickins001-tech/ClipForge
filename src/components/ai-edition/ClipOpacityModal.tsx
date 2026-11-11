// F8's first property panel: a clip's opacity over time.
//
// CapCut-shaped and modelled on `ClipAudioModal`: the slider commits on release (one write, one
// undo step) and a key is a CAPTURE, not a placement — put the playhead where you want it, set the
// value, press the key button. The list is the track; a key's `at` is shown as a percentage of the
// clip, which is how it is stored.
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { AxcutClip, AxcutClipPropertyKey } from "@/lib/ai-edition/schema";
import {
	KEY_EASINGS,
	type OpacityEasing,
	opacityKeyAtFor,
	removeOpacityKey,
	sampleOpacity,
	setKeyEasing,
	setOpacityKey,
} from "@/lib/ai-edition/timeline/opacityKeyframes";
import { type SpeedRegion, screenTimeMs } from "@/lib/ai-edition/timeline/speed";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

export function ClipOpacityModal({
	open,
	onClose,
	clip,
	playheadSec,
	speedRegions,
	onChange,
}: {
	open: boolean;
	onClose: () => void;
	clip: AxcutClip | null;
	/** Timeline seconds; converted to the clip's source clock before a key is placed. */
	playheadSec: number;
	speedRegions: readonly SpeedRegion[];
	onChange: (keys: AxcutClipPropertyKey[]) => void;
}) {
	const t = useScopedT("settings");
	const tc = useScopedT("common");
	const [live, setLive] = useState<number | null>(null);
	// The panel writes a WHOLE list, so it has to own it while open: re-reading `clip.opacityKeys`
	// from the snapshot taken at open would make a second capture forget the first. A reopen
	// (another clip, or the same one later) reseeds from the document.
	const [keys, setKeys] = useState<AxcutClipPropertyKey[]>(clip?.opacityKeys ?? []);
	const clipId = clip?.id ?? null;
	// A drag released outside the input never fires its commit; dropping the live value on a clip
	// change makes sure an uncommitted 20 % does not show up on the next clip.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clipId is the trigger; `clip` is the value it selects.
	useEffect(() => {
		setLive(null);
		setKeys(clip?.opacityKeys ?? []);
	}, [clipId]);

	if (!clip) return null;
	const write = (next: AxcutClipPropertyKey[]) => {
		setKeys(next);
		onChange(next);
	};
	// The compositor samples with SOURCE time (`set_timeline_time`), so a key captured while a
	// speed region runs lands where the picture is, not where the ruler is.
	const sourceSec = screenTimeMs(speedRegions, playheadSec * 1000) / 1000;
	const at = opacityKeyAtFor(clip, sourceSec);
	const value = live ?? sampleOpacity(keys, at ?? 0);
	const capture = (next: number) => {
		if (at === null) return;
		write(setOpacityKey(keys, at, next));
	};

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title={t("opacity.title")}
			footer={
				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<button type="button" onClick={onClose} data-testid="clip-opacity-done">
						{tc("actions.close")}
					</button>
				</div>
			}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<div style={{ flex: 1 }}>
					<SliderCell
						label={t("opacity.label")}
						value={Math.round(value * 100)}
						min={0}
						max={100}
						step={1}
						decimals={0}
						suffix="%"
						onChange={(next) => setLive(next / 100)}
						onCommit={() => {
							if (live !== null) capture(live);
						}}
					/>
				</div>
				<button
					type="button"
					disabled={at === null}
					onClick={() => capture(value)}
					data-testid="clip-opacity-add"
				>
					{t("opacity.add")}
				</button>
			</div>
			<p style={{ margin: "10px 0 0", opacity: 0.75, fontSize: 12 }}>
				{at === null ? t("opacity.outside") : t("opacity.hint")}
			</p>

			{keys.length > 0 && (
				<>
					<ul
						data-testid="clip-opacity-keys"
						style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}
					>
						{keys.map((key) => (
							<li
								key={key.at}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "4px 0",
									borderBottom: "1px solid rgba(255,255,255,0.08)",
								}}
							>
								<span>
									{Math.round(key.at * 100)}% · {Math.round(key.value * 100)}%
								</span>
								<select
									aria-label={t("keyframeEasing.label")}
									value={key.easing ?? "linear"}
									onChange={(event) =>
										write(setKeyEasing(keys, key.at, event.target.value as OpacityEasing))
									}
									style={{ marginLeft: 8, marginRight: 8 }}
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
								</select>
								<button
									type="button"
									aria-label={t("opacity.remove")}
									onClick={() => write(removeOpacityKey(keys, key.at))}
								>
									×
								</button>
							</li>
						))}
					</ul>
					<button
						type="button"
						onClick={() => write([])}
						data-testid="clip-opacity-clear"
						style={{ marginTop: 10 }}
					>
						{t("opacity.clear")}
					</button>
				</>
			)}
		</ModalShell>
	);
}
