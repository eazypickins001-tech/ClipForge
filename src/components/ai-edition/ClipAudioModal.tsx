// The clip's own sound, in one panel — CapCut's Volume sheet, reached from the clip toolbar.
//
// CapCut puts mute ON the volume control: a speaker at the left of the slider that crosses out
// when it is off, rather than a separate action somewhere else. That arrangement is the point of
// copying it, so the speaker sits beside the slider here too.
//
// Changes apply as they are made, not on an "Apply": the slider keeps a live value while the
// drag is in flight and commits once on release, so a sweep is one write and one undo step —
// the same shape as the audio track's own pane (RightPanes, AudioTrackPane).
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { AUDIO_FADE_MAX_MS } from "@/lib/ai-edition/document/audioTracks";
import type { AxcutClip, AxcutClipPropertyKey } from "@/lib/ai-edition/schema";
import {
	AUDIO_TRACK_GAIN_DB_MAX,
	AUDIO_TRACK_GAIN_DB_MIN,
} from "@/lib/ai-edition/store/editorSettings";
import {
	moveKey,
	removeOpacityKey,
	sampleOpacity,
	setKeyEasing,
	setOpacityKey,
} from "@/lib/ai-edition/timeline/opacityKeyframes";
import { KeyEasingControl } from "./KeyEasingControl";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

/** What the panel can write on a clip: the level, mute, fades, and F8's volume envelope. */
export type ClipAudioPatch = Partial<
	Pick<AxcutClip, "gainDb" | "muted" | "fadeInMs" | "fadeOutMs" | "volumeKeys">
>;

export function ClipAudioModal({
	open,
	onClose,
	clip,
	playheadSec,
	onChange,
	onSeek,
}: {
	open: boolean;
	onClose: () => void;
	clip: AxcutClip | null;
	/** Timeline seconds; a volume key is captured at this position inside the clip. */
	playheadSec: number;
	onChange: (patch: ClipAudioPatch) => void;
	/** Jump the playhead to a key (timeline seconds). Omitted in tests/no-player contexts. */
	onSeek?: (sec: number) => void;
}) {
	const t = useScopedT("settings");
	const tc = useScopedT("common");
	// Live-drag values; null means "show the committed value".
	const [liveGain, setLiveGain] = useState<number | null>(null);
	const [liveFadeIn, setLiveFadeIn] = useState<number | null>(null);
	const [liveFadeOut, setLiveFadeOut] = useState<number | null>(null);
	// F8: the volume envelope is a list, so the panel owns it while open (a second capture must
	// build on the first, not re-read the clip snapshot taken at open).
	const [volumeKeys, setVolumeKeys] = useState<AxcutClipPropertyKey[]>(clip?.volumeKeys ?? []);
	const [liveVolume, setLiveVolume] = useState<number | null>(null);
	const clipId = clip?.id ?? null;
	// Drop the live values when the panel moves to another clip: a drag released outside the
	// input never fires its commit, so an uncommitted -10 dB would otherwise show as the next
	// clip's volume.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clipId is the trigger, not a read.
	useEffect(() => {
		setLiveGain(null);
		setLiveFadeIn(null);
		setLiveFadeOut(null);
		setLiveVolume(null);
		setVolumeKeys(clip?.volumeKeys ?? []);
	}, [clipId]);

	if (!clip) return null;
	const muted = clip.muted === true;
	// F8's envelope `at` runs over the clip's OUTPUT span, which is what the mixer stretches.
	const clipSpanSec = clip.timelineEndSec - clip.timelineStartSec;
	const clipLocalSec = playheadSec - clip.timelineStartSec;
	const volumeAt =
		clipSpanSec > 1e-9 && clipLocalSec >= 0 && clipLocalSec <= clipSpanSec
			? clipLocalSec / clipSpanSec
			: null;
	const volumeValue = liveVolume ?? sampleOpacity(volumeKeys, volumeAt ?? 0);
	const writeVolumeKeys = (next: AxcutClipPropertyKey[]) => {
		setVolumeKeys(next);
		onChange({ volumeKeys: next });
	};
	const captureVolume = (next: number) => {
		if (volumeAt === null) return;
		writeVolumeKeys(setOpacityKey(volumeKeys, volumeAt, next));
	};
	const seekToKey = (keyAt: number) => {
		// The envelope `at` is output-normalised, so the way back to the ruler is the clip span.
		if (!onSeek) return;
		onSeek(clip.timelineStartSec + keyAt * (clip.timelineEndSec - clip.timelineStartSec));
	};

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title={t("audio.title")}
			footer={
				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<button type="button" onClick={onClose} data-testid="clip-audio-done">
						{tc("actions.close")}
					</button>
				</div>
			}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				{/* CapCut's gesture: the speaker at the left of the slider IS the mute. Constant
				    label with `aria-pressed`, because it is a toggle and a label that flipped
				    between Mute and Unmute would make the button a different target each click. */}
				<button
					type="button"
					aria-label={t("audioTrack.mute")}
					aria-pressed={muted}
					data-testid="clip-audio-mute"
					onClick={() => onChange({ muted: !muted })}
					style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
				>
					{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
				</button>
				<div style={{ flex: 1 }}>
					<SliderCell
						label={t("audio.outputGain")}
						value={liveGain ?? clip.gainDb ?? 0}
						min={AUDIO_TRACK_GAIN_DB_MIN}
						max={AUDIO_TRACK_GAIN_DB_MAX}
						step={0.5}
						decimals={1}
						suffix=" dB"
						onChange={setLiveGain}
						onCommit={() => {
							if (liveGain !== null) onChange({ gainDb: liveGain });
						}}
					/>
				</div>
			</div>

			<div style={{ marginTop: 12 }}>
				<SliderCell
					label={t("audioTrack.fadeIn")}
					value={liveFadeIn ?? clip.fadeInMs ?? 0}
					min={0}
					max={AUDIO_FADE_MAX_MS}
					step={50}
					decimals={0}
					suffix=" ms"
					onChange={setLiveFadeIn}
					onCommit={() => {
						if (liveFadeIn !== null) onChange({ fadeInMs: liveFadeIn });
					}}
				/>
				<SliderCell
					label={t("audioTrack.fadeOut")}
					value={liveFadeOut ?? clip.fadeOutMs ?? 0}
					min={0}
					max={AUDIO_FADE_MAX_MS}
					step={50}
					decimals={0}
					suffix=" ms"
					onChange={setLiveFadeOut}
					onCommit={() => {
						if (liveFadeOut !== null) onChange({ fadeOutMs: liveFadeOut });
					}}
				/>
			</div>

			{/* F8: the clip's volume over time, a 0..1 multiplier on its level above. */}
			<div
				style={{
					marginTop: 16,
					borderTop: "1px solid rgba(255,255,255,0.08)",
					paddingTop: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<div style={{ flex: 1 }}>
						<SliderCell
							label={t("audio.volumeKeys")}
							value={Math.round(volumeValue * 100)}
							min={0}
							max={100}
							step={1}
							decimals={0}
							suffix="%"
							onChange={(next) => setLiveVolume(next / 100)}
							onCommit={() => {
								if (liveVolume !== null) captureVolume(liveVolume);
							}}
						/>
					</div>
					<button
						type="button"
						disabled={volumeAt === null}
						onClick={() => captureVolume(volumeValue)}
						data-testid="clip-volume-add"
					>
						{t("opacity.add")}
					</button>
				</div>
				<p style={{ margin: "8px 0 0", opacity: 0.75, fontSize: 12 }}>
					{volumeAt === null ? t("opacity.outside") : t("audio.volumeKeysHint")}
				</p>
				{volumeKeys.length > 0 && (
					<>
						<ul
							data-testid="clip-volume-keys"
							style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}
						>
							{volumeKeys.map((key) => (
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
									<input
										type="number"
										min={0}
										max={100}
										step={1}
										aria-label={t("opacity.keyPosition")}
										defaultValue={Math.round(key.at * 100)}
										onKeyDown={(event) => {
											if (event.key === "Enter") event.currentTarget.blur();
										}}
										onBlur={(event) => {
											const pct = Number(event.target.value);
											if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
												const nextAt = pct / 100;
												if (Math.abs(nextAt - key.at) > 1e-6) {
													writeVolumeKeys(moveKey(volumeKeys, key.at, nextAt));
												}
											} else {
												event.target.value = String(Math.round(key.at * 100));
											}
										}}
										style={{ width: 54 }}
									/>
									<span style={{ marginLeft: 4 }}>%</span>
									<span style={{ marginLeft: 8, opacity: 0.75 }}>
										{Math.round(key.value * 100)}%
									</span>
									<button
										type="button"
										aria-label={t("opacity.goToKey")}
										onClick={() => seekToKey(key.at)}
										style={{ marginLeft: "auto", marginRight: 4 }}
									>
										→
									</button>
									<span style={{ marginLeft: 8, marginRight: 8 }}>
										<KeyEasingControl
											value={key.easing}
											onChange={(easing) =>
												writeVolumeKeys(setKeyEasing(volumeKeys, key.at, easing))
											}
										/>
									</span>
									<button
										type="button"
										aria-label={t("opacity.remove")}
										onClick={() => writeVolumeKeys(removeOpacityKey(volumeKeys, key.at))}
									>
										×
									</button>
								</li>
							))}
						</ul>
						<button
							type="button"
							onClick={() => writeVolumeKeys([])}
							data-testid="clip-volume-clear"
							style={{ marginTop: 10 }}
						>
							{t("opacity.clear")}
						</button>
					</>
				)}
			</div>
		</ModalShell>
	);
}
