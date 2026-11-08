// Thumbnail Studio: three prompt-only thumbnail concepts and the publishing copy beside them, plus
// (F5 step 4) direct image generation through OpenRouter. Prompt-only mode still works with no
// provider; generation is consent-gated and reports the ACTUAL cost OpenRouter charged.
//
// The composition SAVES as data in the project envelope (one write, one undo). The generated image
// is saved to a file the user picks; the document keeps only its path, model, media type and cost —
// never the bytes. The pixel editor and PNG/JPEG export are the next F5 step and are not claimed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	buildThumbnailStudio,
	DEFAULT_THUMBNAIL_IMAGE_MODEL,
	defaultStudioInputs,
	STUDIO_PLATFORMS,
	type StoredThumbnailImage,
	type StoredThumbnailStudio,
	type StudioPlatform,
	type ThumbnailStudioInputs,
	type ThumbnailStudioResult,
} from "@/lib/ai-edition/thumbnailStudio";
import { ModalShell } from "./Modals";

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
	const [imageModel, setImageModel] = useState(
		saved?.image?.model ?? DEFAULT_THUMBNAIL_IMAGE_MODEL,
	);
	const [image, setImage] = useState<StoredThumbnailImage | null>(saved?.image ?? null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [imagePhase, setImagePhase] = useState<"idle" | "generating">("idle");
	const [consentIndex, setConsentIndex] = useState<number | null>(null);
	const [imageError, setImageError] = useState<string | null>(null);
	const [imageSaved, setImageSaved] = useState(false);

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
			setImageModel(saved?.image?.model ?? DEFAULT_THUMBNAIL_IMAGE_MODEL);
			setImage(saved?.image ?? null);
			setImagePreview(null);
			setImagePhase("idle");
			setConsentIndex(null);
			setImageError(null);
			setImageSaved(false);
		}
		wasOpen.current = open;
	}, [open, projectTitle, saved]);

	const patchInputs = useCallback((patch: Partial<ThumbnailStudioInputs>) => {
		setInputs((current) => ({ ...current, ...patch }));
		setSavedNow(false);
	}, []);

	const generate = useCallback(() => {
		setResult(buildThumbnailStudio(inputs, transcriptText));
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

	const updatePrompt = useCallback((index: number, prompt: string) => {
		setResult((current) =>
			current
				? {
						...current,
						concepts: current.concepts.map((concept, at) =>
							at === index ? { ...concept, prompt } : concept,
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

	// Consent first: the panel says what will be called and that it spends credits; the real cost
	// comes back with the image. The button is disabled while one generation is in flight.
	const generateImage = useCallback(
		async (prompt: string) => {
			const api = window.electronAPI;
			if (!api?.generateThumbnailImage) {
				setImageError(te("inspector.studioImageNoKey"));
				return;
			}
			setConsentIndex(null);
			setImagePhase("generating");
			setImageError(null);
			try {
				const response = await api.generateThumbnailImage({ prompt, model: imageModel });
				if (!response.success) {
					setImagePhase("idle");
					setImageError(
						response.reason === "no-key"
							? te("inspector.studioImageNoKey")
							: (response.message ?? te("inspector.studioImageFailed")),
					);
					return;
				}
				setImage({
					model: response.model ?? imageModel,
					...(response.mediaType ? { mediaType: response.mediaType } : {}),
					...(response.costUsd === undefined ? {} : { costUsd: response.costUsd }),
					...(image?.path ? { path: image.path } : {}),
				});
				setImagePreview(response.dataUrl ?? null);
				setImageSaved(false);
				setSavedNow(false);
			} catch (error) {
				setImageError(String(error));
			} finally {
				setImagePhase("idle");
			}
		},
		[image?.path, imageModel, te],
	);

	const saveImage = useCallback(async () => {
		const api = window.electronAPI;
		if (!imagePreview || !api?.saveThumbnailImage) return;
		const response = await api.saveThumbnailImage({
			dataUrl: imagePreview,
			suggestedName: inputs.title || "thumbnail",
		});
		if (response.success && response.path) {
			setImage((current) =>
				current ? { ...current, path: response.path } : { model: imageModel, path: response.path },
			);
			setImageSaved(true);
			setSavedNow(false);
		} else if (response.message) {
			setImageError(response.message);
		}
	}, [imageModel, imagePreview, inputs.title]);

	const save = useCallback(async () => {
		if (!result || saving) return;
		setSaving(true);
		const ok = await onSave({ inputs, result, ...(image ? { image } : {}) });
		setSaving(false);
		if (ok) setSavedNow(true);
	}, [image, inputs, onSave, result, saving]);

	const evidenceLine = useMemo(
		() =>
			result?.evidence.basis.includes("transcript")
				? te("inspector.studioEvidenceTranscript")
				: te("inspector.studioEvidenceTitle"),
		[result?.evidence.basis, te],
	);

	const copyLabel = (key: string) =>
		copied === key ? te("inspector.studioCopied") : te("inspector.studioCopy");
	const imageBusy = imagePhase === "generating";

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			wide
			title={te("inspector.thumbnailStudio")}
			subtitle={te("inspector.studioPromptOnly")}
			footer={
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button type="button" onClick={onClose} data-testid="studio-close">
						{tc("actions.close")}
					</button>
					<button
						type="button"
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
						value={inputs.brief}
						onChange={(event) => patchInputs({ brief: event.target.value })}
					/>
				</label>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioAudience")}</span>
						<input
							style={inputStyle}
							value={inputs.audience}
							onChange={(event) => patchInputs({ audience: event.target.value })}
						/>
					</label>
					<label style={fieldStyle}>
						<span style={labelStyle}>{te("inspector.studioBrand")}</span>
						<input
							style={inputStyle}
							value={inputs.brand}
							onChange={(event) => patchInputs({ brand: event.target.value })}
						/>
					</label>
				</div>
				<label style={fieldStyle}>
					<span style={labelStyle}>{te("inspector.studioExclusions")}</span>
					<input
						style={inputStyle}
						value={inputs.exclusions}
						onChange={(event) => patchInputs({ exclusions: event.target.value })}
					/>
				</label>
				<div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
					<button type="button" onClick={generate} data-testid="studio-generate">
						{te("inspector.studioGenerate")}
					</button>
					<label style={{ ...fieldStyle, flex: 1 }}>
						<span style={labelStyle}>{te("inspector.studioImageModel")}</span>
						<input
							data-testid="studio-image-model"
							style={inputStyle}
							value={imageModel}
							onChange={(event) => setImageModel(event.target.value)}
						/>
					</label>
				</div>

				{result ? (
					<>
						<p style={{ margin: 0, font: "400 12px/1.3 var(--font-body)" }}>{evidenceLine}</p>

						<section>
							<h3 style={{ margin: "0 0 8px", font: "600 13px/1.3 var(--font-body)" }}>
								{te("inspector.studioConcepts")}
							</h3>
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								{result.concepts.map((concept, index) => (
									<div
										key={concept.id}
										style={{
											border: "1px solid var(--border-soft)",
											borderRadius: 8,
											padding: 10,
											display: "flex",
											flexDirection: "column",
											gap: 6,
										}}
									>
										<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
											<strong style={{ font: "600 13px/1.3 var(--font-body)" }}>
												{concept.hook}
											</strong>
											<div style={{ display: "flex", gap: 6 }}>
												<button
													type="button"
													onClick={() => void copy(`concept-${index}`, concept.prompt)}
												>
													{copyLabel(`concept-${index}`)}
												</button>
												<button
													type="button"
													disabled={imageBusy}
													data-testid={`studio-image-${index}`}
													onClick={() => setConsentIndex(index)}
												>
													{te("inspector.studioGenerateImage")}
												</button>
											</div>
										</div>
										<span style={{ font: "400 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
											{concept.rationale}
										</span>
										<textarea
											aria-label={`${concept.id} prompt`}
											data-testid={`studio-prompt-${index}`}
											style={{ ...inputStyle, minHeight: 74, resize: "vertical" }}
											value={concept.prompt}
											onChange={(event) => updatePrompt(index, event.target.value)}
										/>
										<span style={{ font: "400 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
											{concept.thumbnailText} · {concept.focalPoint}
										</span>
										{consentIndex === index ? (
											<div
												style={{
													border: "1px solid var(--border-soft)",
													borderRadius: 6,
													padding: 8,
													display: "flex",
													alignItems: "center",
													gap: 8,
													flexWrap: "wrap",
												}}
											>
												<span style={{ flex: 1, font: "400 12px/1.3 var(--font-body)" }}>
													{te("inspector.studioImageConsent")} ({imageModel})
												</span>
												<button
													type="button"
													onClick={() => setConsentIndex(null)}
													data-testid="studio-image-consent-cancel"
												>
													{tc("actions.cancel")}
												</button>
												<button
													type="button"
													onClick={() => void generateImage(concept.prompt)}
													data-testid="studio-image-confirm"
												>
													{te("inspector.studioImageConfirm")}
												</button>
											</div>
										) : null}
									</div>
								))}
							</div>
						</section>

						{imageBusy ? (
							<p role="status" style={{ margin: 0 }}>
								{te("inspector.studioImageGenerating")}
							</p>
						) : null}
						{imageError ? (
							<p role="alert" style={{ margin: 0 }}>
								{imageError}
							</p>
						) : null}
						{imagePreview ? (
							<section>
								<h3 style={{ margin: "0 0 8px", font: "600 13px/1.3 var(--font-body)" }}>
									{te("inspector.studioGenerateImage")}
								</h3>
								<img
									src={imagePreview}
									alt={te("inspector.studioImageAlt")}
									data-testid="studio-image-preview"
									style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border-soft)" }}
								/>
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
									<span style={{ flex: 1, font: "400 12px/1.3 var(--font-body)" }}>
										{image?.costUsd === undefined
											? ""
											: te("inspector.studioImageCost", {
													cost: image.costUsd.toFixed(4),
												})}
									</span>
									<button
										type="button"
										onClick={() => void saveImage()}
										data-testid="studio-image-save"
									>
										{imageSaved
											? te("inspector.studioImageSaved")
											: te("inspector.studioImageSave")}
									</button>
								</div>
								{image?.path ? (
									<span style={{ font: "400 11px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
										{image.path}
									</span>
								) : null}
							</section>
						) : image?.path ? (
							<span style={{ font: "400 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
								{te("inspector.studioImageSaved")}: {image.path}
							</span>
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
