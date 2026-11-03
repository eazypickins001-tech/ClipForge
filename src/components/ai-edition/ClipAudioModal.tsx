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
import type { AxcutClip } from "@/lib/ai-edition/schema";
import {
	AUDIO_TRACK_GAIN_DB_MAX,
	AUDIO_TRACK_GAIN_DB_MIN,
} from "@/lib/ai-edition/store/editorSettings";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

/** What the panel can write on a clip: the same four fields `setClipAudio` takes. */
export type ClipAudioPatch = Partial<
	Pick<AxcutClip, "gainDb" | "muted" | "fadeInMs" | "fadeOutMs">
>;

export function ClipAudioModal({
	open,
	onClose,
	clip,
	onChange,
}: {
	open: boolean;
	onClose: () => void;
	clip: AxcutClip | null;
	onChange: (patch: ClipAudioPatch) => void;
}) {
	const t = useScopedT("settings");
	const tc = useScopedT("common");
	// Live-drag values; null means "show the committed value".
	const [liveGain, setLiveGain] = useState<number | null>(null);
	const [liveFadeIn, setLiveFadeIn] = useState<number | null>(null);
	const [liveFadeOut, setLiveFadeOut] = useState<number | null>(null);
	const clipId = clip?.id ?? null;
	// Drop the live values when the panel moves to another clip: a drag released outside the
	// input never fires its commit, so an uncommitted -10 dB would otherwise show as the next
	// clip's volume.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clipId is the trigger, not a read.
	useEffect(() => {
		setLiveGain(null);
		setLiveFadeIn(null);
		setLiveFadeOut(null);
	}, [clipId]);

	if (!clip) return null;
	const muted = clip.muted === true;

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
		</ModalShell>
	);
}
