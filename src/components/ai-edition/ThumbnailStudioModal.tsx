// Thumbnail Studio: ONE prompt-only thumbnail prompt and the publishing copy beside it. Nothing
// here calls a provider — the prompt is composed locally and copied into whatever image tool the
// creator uses. No image model, no API key, no spend.
//
// The composition SAVES as data in the project envelope (one write, one undo); the 1280x720
// composer exports PNG/JPEG. Image bytes never live in the document.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	buildThumbnailStudio,
	defaultStudioInputs,
	defaultThumbnailComposition,
	STUDIO_PLATFORMS,
	type StoredThumbnailStudio,
	type StudioPlatform,
	type ThumbnailComposition,
	type ThumbnailStudioInputs,
	type ThumbnailStudioResult,
} from "@/lib/ai-edition/thumbnailStudio";
import { ModalShell } from "./Modals";
import css from "./NewEditorShell.module.css";
import { ThumbnailComposer } from "./ThumbnailComposer";

const fieldStyle = { display: "flex", flexDirection: "column", gap: 4 } as const;
const labelStyle = { font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" } as const;
const inputStyle = {
	font: "400 13px/1.4 var(--font-body)",
	color: "var(--fg-1)",
	background: "var(--surface-2)",
	border: "1px solid var(--border-soft)",
	borderRadius: 6,
	padding: "6px 8px",
	width: "100%",
	boxSizing: "border-box",
} as const;

export function ThumbnailStudioModal({
	open,
	onClose,
	projectTitle,
	transcriptText,
	saved,
	onSave,
}: {
	open: boolean;
	onClose: () => void;
	projectTitle: string;
	transcriptText: string;
	saved: StoredThumbnailStudio | null;
	onSave: (data: StoredThumbnailStudio) => Promise<boolean>;
}) {
	const te = useScopedT("editor");
	const tc = useScopedT("common");
	const [inputs, setInputs] = useState<ThumbnailStudioInputs>(
		() => saved?.inputs ?? defaultStudioInputs(projectTitle),
	);
	const [result, setResult] = useState<ThumbnailStudioResult | null>(saved?.result ?? null);
	const [copied, setCopied] = useState<string | null>(null);
	const [savedNow, setSavedNow] = useState(false);
	const [saving, setSaving] = useState(false);
	const [editor, setEditor] = useState<ThumbnailComposition>(() =>
		defaultThumbnailComposition(saved?.result ?? null),
	);
	const [exported, setExported] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);

	// Opening the panel starts from this project's saved composition, or from the title alone. The
	// panel stays mounted between opens, so this cannot be initial state only. Keyed on the OPEN
	// edge: a save writes the same data back and must not reset the panel (or the "Saved" label).
	const wasOpen = useRef(false);
	useEffect(() => {
		if (open && !wasOpen.current) {
			setInputs(saved?.inputs ?? defaultStudioInputs(projectTitle));
			setResult(saved?.result ?? null);
			setCopied(null);
			setSavedNow(false);
			setEditor(saved?.editor ?? defaultThumbnailComposition(saved?.result ?? null));
			setExported(false);
			setExportError(null);
		}
		wasOpen.current = open;
	}, [open, projectTitle, saved]);

	const patchInputs = useCallback((patch: Partial<ThumbnailStudioInputs>) => {
		setInputs((current) => ({ ...current, ...patch }));
		setSavedNow(false);
	}, []);

	const generate = useCallback(() => {
		const next = buildThumbnailStudio(inputs, transcriptText);
		setResult(next);
		setEditor((current) =>
			current.headline.trim() === "" || current.headline === "YOUR HEADLINE"
				? { ...current, headline: next.concepts[0]?.thumbnailText ?? current.headline }
				: current,
		);
		setSavedNow(false);
	}, [inputs, transcriptText]);

	const copy = useCallback(async (key: string, text: string) => {
		try {
			const bridge = window.electronAPI?.copyToClipboard;
			if (bridge) await bridge(text);
			else await navigator.clipboard.writeText(text);
			setCopied(key);
			window.setTimeout(() => setCopied(null), 1500);
		} catch {
			setCopied(null);
		}
	}, []);

	const updatePrompt = useCallback((prompt: string) => {
		setResult((current) =>
			current
				? {
						...current,
						concepts: current.concepts.map((concept, at) =>
							at === 0 ? { ...concept, prompt } : concept,
						),
					}
				: current,
		);
		setSavedNow(false);
	}, []);

	const updatePublishing = useCallback((patch: Partial<ThumbnailStudioResult["publishing"]>) => {
		setResult((current) =>
			current ? { ...current, publishing: { ...current.publishing, ...patch } } : current,
		);
		setSavedNow(false);
	}, []);

	const save = useCallback(async () => {
		if (!result || saving) return;
		setSaving(true);
		const ok = await onSave({ version: 1, inputs, result, editor });
		setSaving(false);
		if (ok) setSavedNow(true);
	}, [editor, inputs, onSave, result, saving]);

	// The composed 1280×720 frame goes through the image-save IPC; only the file is written, and
	// the composition settings are what the project stores.
	const exportComposed = useCallback(
		async (dataUrl: string, format: "png" | "jpeg") => {
			const api = window.electronAPI;
			if (!api?.saveThumbnailImage) return;
			const response = await api.saveThumbnailImage({
				dataUrl,
				suggestedName: `${inputs.title || "thumbnail"}-${format}`,
			});
			if (response.success) {
				setExported(true);
				setExportError(null);
				setSavedNow(false);
			} else if (response.message) {
				setExportError(response.message);
			}
		},
		[inputs.title],
	);

	const evidenceLine = useMemo(
		() =>
			result?.evidence.basis.includes("transcript")
				? te("inspector.studioEvidenceTranscript")
				: te("inspector.studioEvidenceTitle"),
		[result?.evidence.basis, te],
	);

	const copyLabel = (key: string) =>
		copied === key ? te("inspector.studioCopied") : te("inspector.studioCopy");

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			wide
			title={te("inspector.thumbnailStudio")}
			subtitle={te("inspector.studioPromptOnly")}
			footer={
				// The primary action lives HERE, not in the scrollable body: generating the
				// concepts is what produces the result Save writes, so a body button could be
				// scrolled out of sight and leave Save permanently disabled ("dead").
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						type="button"
						className={`${css.btn} ${css.btnSecondary}`}
						onClick={onClose}
						data-testid="studio-close"
					>
						{tc("actions.close")}
					</button>
					<button
						type="button"
						className={`${css.btn} ${result ? css.btnSecondary : css.btnPrimary}`}
						onClick={generate}
						data-testid="studio-generate"
					>
						{te("inspector.studioGenerate")}
					</button>
					<button
						type="button"
						className={`${css.btn} ${result ? css.btnPrimary : css.btnSecondary}`}
						onClick={() => void save()}
						disabled={!result || saving}
						data-testid="studio-save"
					>
						{savedNow ? te("inspector.studioSaved") : te("inspector.studioSave")}
					</button>
				</div>
			}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
				<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioTitle")}</span>
						<input
							data-testid="studio-title"
							style={inputStyle}
							placeholder={te("inspector.studioTitlePlaceholder")}
							value={inputs.title}
							onChange={(event) => patchInputs({ title: event.target.value })}
						/>
					</label>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioPlatform")}</span>
						<select
							style={inputStyle}
							value={inputs.platform}
							onChange={(event) => patchInputs({ platform: event.target.value as StudioPlatform })}
						>
							{STUDIO_PLATFORMS.map((platform) => (
								<option key={platform} value={platform}>
									{platform === "youtube"
										? "YouTube"
										: platform === "tiktok"
											? "TikTok"
											: platform === "instagram"
												? "Instagram"
												: platform === "linkedin"
													? "LinkedIn"
													: "X"}
								</option>
							))}
						</select>
					</label>
				</div>
				<label style={fieldStyle}>
					<span style={labelStyle}>{te("inspector.studioBrief")}</span>
					<textarea
						style={{ ...inputStyle, minHeight: 52, resize: "vertical" }}
						placeholder={te("inspector.studioBriefPlaceholder")}
						value={inputs.brief}
						onChange={(event) => patchInputs({ brief: event.target.value })}
					/>
				</label>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioAudience")}</span>
						<input
							style={inputStyle}
							placeholder={te("inspector.studioAudiencePlaceholder")}
							value={inputs.audience}
							onChange={(event) => patchInputs({ audience: event.target.value })}
						/>
					</label>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioBrand")}</span>
						<input
							style={inputStyle}
							placeholder={te("inspector.studioBrandPlaceholder")}
							value={inputs.brand}
							onChange={(event) => patchInputs({ brand: event.target.value })}
						/>
					</label>
				</div>
				<label style={fieldStyle}>
					<span style={labelStyle}>{te("inspector.studioExclusions")}</span>
					<input
						style={inputStyle}
						placeholder={te("inspector.studioExclusionsPlaceholder")}
						value={inputs.exclusions}
						onChange={(event) => patchInputs({ exclusions: event.target.value })}
					/>
				</label>

				{result ? (
					<>
						<section>
							<div
								style={{
									display: "flex",
									alignItems: "baseline",
									justifyContent: "space-between",
									gap: 8,
									marginBottom: 8,
								}}
							>
								<h3 style={{ margin: 0, font: "600 13px/1.3 var(--font-body)" }}>
									{te("inspector.studioPrompt")}
								</h3>
								<span style={{ font: "400 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
									{evidenceLine}
								</span>
							</div>
							<textarea
								aria-label={te("inspector.studioPrompt")}
								data-testid="studio-prompt-0"
								style={{ ...inputStyle, minHeight: 160, resize: "vertical" }}
								value={result.concepts[0]?.prompt ?? ""}
								onChange={(event) => updatePrompt(event.target.value)}
							/>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 8,
									marginTop: 6,
								}}
							>
								<span style={{ font: "400 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
									{te("inspector.studioPromptHint")}
								</span>
								<button
									type="button"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={() => void copy("prompt", result.concepts[0]?.prompt ?? "")}
									data-testid="studio-copy-prompt"
								>
									{copyLabel("prompt")}
								</button>
							</div>
						</section>

						<ThumbnailComposer
							// No image is generated here: the composer lays the headline/logo over
							// its own solid background. The prompt above is what makes the picture.
							backgroundDataUrl={null}
							value={editor}
							onChange={(next) => {
								setEditor(next);
								setSavedNow(false);
								setExported(false);
							}}
							onExport={(dataUrl, format) => void exportComposed(dataUrl, format)}
						/>
						{exported ? (
							<p role="status" style={{ margin: 0 }}>
								{te("inspector.studioExported")}
							</p>
						) : null}
						{exportError ? (
							<p role="alert" style={{ margin: 0 }}>
								{exportError}
							</p>
						) : null}

						<section>
							<h3 style={{ margin: "0 0 8px", font: "600 13px/1.3 var(--font-body)" }}>
								{te("inspector.studioPublishing")}
							</h3>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								<label style={fieldStyle}>
									<span style={labelStyle}>{te("inspector.studioTitle")}</span>
									<div style={{ display: "flex", gap: 6 }}>
										<input
											data-testid="studio-publishing-title"
											style={inputStyle}
											value={result.publishing.title}
											onChange={(event) => updatePublishing({ title: event.target.value })}
										/>
										<button
											type="button"
											onClick={() => void copy("publish-title", result.publishing.title)}
										>
											{copyLabel("publish-title")}
										</button>
									</div>
								</label>
								<label style={fieldStyle}>
									<span style={labelStyle}>{te("inspector.studioDescription")}</span>
									<textarea
										data-testid="studio-publishing-body"
										style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
										value={result.publishing.body}
										onChange={(event) => updatePublishing({ body: event.target.value })}
									/>
								</label>
								<label style={fieldStyle}>
									<span style={labelStyle}>{te("inspector.studioTags")}</span>
									<div style={{ display: "flex", gap: 6 }}>
										<input
											data-testid="studio-publishing-tags"
											style={inputStyle}
											value={result.publishing.tags.join(", ")}
											onChange={(event) =>
												updatePublishing({
													tags: event.target.value.split(/[\s,]+/).filter(Boolean),
												})
											}
										/>
										<button
											type="button"
											onClick={() => void copy("publish-tags", result.publishing.tags.join(", "))}
										>
											{copyLabel("publish-tags")}
										</button>
									</div>
								</label>
							</div>
						</section>
					</>
				) : null}
			</div>
		</ModalShell>
	);
}
