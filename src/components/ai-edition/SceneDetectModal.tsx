// Scene detection's settings sheet: the sensitivity the pass runs at, the shortest shot it may
// report, a progress bar and a Cancel that actually kills the FFmpeg child. The pass is a decode,
// not an instant query, so it belongs behind a panel rather than firing from a menu row.
//
// The panel owns the IPC (it needs the progress stream while it is open); the shell owns the
// document edit, so a sweep still lands as ONE `splitClipAtTimesAt` write and one undo step.
import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { ModalShell } from "./Modals";
import { SliderCell } from "./RightPanes";

/** The pass's bounds. A threshold of 1 detects nothing; 0.1 fires on nearly every frame. */
export const SCENE_THRESHOLD_MIN = 0.1;
export const SCENE_THRESHOLD_MAX = 0.9;
export const SCENE_THRESHOLD_DEFAULT = 0.4;
/** A shorter "scene" than this is a flash, not a shot. */
export const SCENE_MIN_SEC_MIN = 0.2;
export const SCENE_MIN_SEC_MAX = 3;
export const SCENE_MIN_SEC_DEFAULT = 0.5;

type Phase = "idle" | "detecting" | "applying";

export function SceneDetectModal({
	open,
	onClose,
	clipId,
	assetPath,
	durationSec,
	onApply,
}: {
	open: boolean;
	onClose: () => void;
	/** The clip the cuts will be applied to. */
	clipId: string | null;
	/** Its asset's file: what FFmpeg decodes. */
	assetPath: string | null;
	/** The asset's probed duration, only for the progress fraction. */
	durationSec: number;
	/** Apply the cuts as one edit. Returns the number of pieces added (for the caller's toast). */
	onApply: (clipId: string, cutsSec: number[]) => Promise<number>;
}) {
	const te = useScopedT("editor");
	const tc = useScopedT("common");
	const [threshold, setThreshold] = useState(SCENE_THRESHOLD_DEFAULT);
	const [minSceneSec, setMinSceneSec] = useState(SCENE_MIN_SEC_DEFAULT);
	const [phase, setPhase] = useState<Phase>("idle");
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	// Bumped by Cancel and by a new run: a late reply from a cancelled pass must not edit.
	const runSeq = useRef(0);

	// A fresh panel always starts at the top, not on the last run's 100%.
	useEffect(() => {
		if (!open) return;
		setPhase("idle");
		setProgress(0);
		setError(null);
	}, [open]);

	useEffect(() => {
		if (!open || !window.electronAPI?.onSceneDetectProgress) return;
		return window.electronAPI.onSceneDetectProgress((fraction) => setProgress(fraction));
	}, [open]);

	const close = useCallback(() => {
		runSeq.current += 1;
		void window.electronAPI?.cancelSceneDetection?.();
		onClose();
	}, [onClose]);

	const run = useCallback(async () => {
		const api = window.electronAPI;
		if (!clipId || !assetPath || !api?.detectScenes) return;
		const my = runSeq.current + 1;
		runSeq.current = my;
		setPhase("detecting");
		setProgress(0);
		setError(null);
		try {
			const result = await api.detectScenes(assetPath, {
				threshold,
				minSceneSec,
				durationSec,
			});
			if (my !== runSeq.current) return;
			if (!result.success) {
				setPhase("idle");
				setError(
					result.reason === "no-ffmpeg"
						? te("inspector.detectScenesUnavailable")
						: (result.message ?? te("inspector.detectScenesNone")),
				);
				return;
			}
			const cutsSec = result.cutsSec ?? [];
			if (cutsSec.length === 0) {
				setPhase("idle");
				setError(te("inspector.detectScenesNone"));
				return;
			}
			setPhase("applying");
			await onApply(clipId, cutsSec);
			if (my !== runSeq.current) return;
			onClose();
		} catch (cause) {
			if (my !== runSeq.current) return;
			setPhase("idle");
			setError(String(cause));
		}
	}, [assetPath, clipId, durationSec, minSceneSec, onApply, onClose, te, threshold]);

	const detecting = phase === "detecting";
	const applying = phase === "applying";
	const busy = detecting || applying;
	const percent = Math.round(progress * 100);

	return (
		<ModalShell
			open={open}
			onClose={busy ? close : onClose}
			closeOnBackdrop={!busy}
			title={te("inspector.detectScenes")}
			footer={
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					{detecting ? (
						<button type="button" onClick={close} data-testid="scene-detect-cancel">
							{tc("actions.cancel")}
						</button>
					) : (
						<button
							type="button"
							onClick={onClose}
							disabled={applying}
							data-testid="scene-detect-close"
						>
							{tc("actions.cancel")}
						</button>
					)}
					<button
						type="button"
						onClick={() => void run()}
						disabled={busy || !clipId || !assetPath}
						data-testid="scene-detect-start"
					>
						{detecting || applying
							? te("inspector.sceneDetecting")
							: te("inspector.sceneDetectStart")}
					</button>
				</div>
			}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
				<SliderCell
					label={te("inspector.sceneSensitivity")}
					value={threshold}
					min={SCENE_THRESHOLD_MIN}
					max={SCENE_THRESHOLD_MAX}
					step={0.05}
					decimals={2}
					hint={te("inspector.sceneSensitivityHint")}
					defaultValue={SCENE_THRESHOLD_DEFAULT}
					disabled={busy}
					onChange={setThreshold}
					onCommit={() => undefined}
				/>
				<SliderCell
					label={te("inspector.sceneMinLength")}
					value={minSceneSec}
					min={SCENE_MIN_SEC_MIN}
					max={SCENE_MIN_SEC_MAX}
					step={0.1}
					decimals={1}
					suffix=" s"
					hint={te("inspector.sceneMinLengthHint")}
					defaultValue={SCENE_MIN_SEC_DEFAULT}
					disabled={busy}
					onChange={setMinSceneSec}
					onCommit={() => undefined}
				/>

				{busy ? (
					<div>
						<div
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={percent}
							data-testid="scene-detect-progress"
							style={{
								height: 6,
								borderRadius: 3,
								background: "var(--border-soft)",
								overflow: "hidden",
							}}
						>
							<div
								style={{
									width: `${percent}%`,
									height: "100%",
									background: "var(--accent, #6b8afd)",
									transition: "width 120ms linear",
								}}
							/>
						</div>
						<p style={{ margin: "6px 0 0", font: "400 12px/1.3 var(--font-body)" }}>
							{te("inspector.sceneDetecting")} {percent}%
						</p>
					</div>
				) : null}

				{error ? (
					<p role="alert" style={{ margin: 0 }}>
						{error}
					</p>
				) : null}
			</div>
		</ModalShell>
	);
}
