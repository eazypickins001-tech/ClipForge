// Thumbnail Studio, prompt-only first: compose three thumbnail concepts and the publishing copy
// beside them from the project's title, brief and transcript. Nothing here calls a provider and
// nothing here makes an image — a creator copies the prompts into whichever image tool they use.
//
// The composition SAVES as data in the project envelope (one write, one undo). Image generation,
// the pixel editor and PNG export are the later F5 steps and are not pretended here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	buildThumbnailStudio,
	defaultStudioInputs,
	STUDIO_PLATFORMS,
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

	const save = useCallback(async () => {
		if (!result || saving) return;
		setSaving(true);
		const ok = await onSave({ inputs, result });
		setSaving(false);
		if (ok) setSavedNow(true);
	}, [inputs, onSave, result, saving]);

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
				<div>
					<button type="button" onClick={generate} data-testid="studio-generate">
						{te("inspector.studioGenerate")}
					</button>
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
											<button
												type="button"
												onClick={() => void copy(`concept-${index}`, concept.prompt)}
											>
												{copyLabel(`concept-${index}`)}
											</button>
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
									</div>
								))}
							</div>
						</section>

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
