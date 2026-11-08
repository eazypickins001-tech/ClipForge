// F5 step 5: the 1280×720 thumbnail composition editor. It draws the generated image (or a solid
// background), a headline with an outline, and an uploaded logo onto a real canvas, then exports
// PNG or JPEG through the same save IPC. The settings are data; the canvas is the only place the
// pixels exist, and they never enter the project document.
import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ThumbnailAlignment,
	type ThumbnailComposition,
	type ThumbnailCorner,
} from "@/lib/ai-edition/thumbnailStudio";
import { SliderCell } from "./RightPanes";

const WIDTH = 1280;
const HEIGHT = 720;
const PAD = 64;
const FONT_STACK = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Could not load the image."));
		image.src = src;
	});
}

function wrapHeadline(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && ctx.measureText(candidate).width > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines.slice(0, 3);
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, zoom: number): void {
	const imageWidth = image.naturalWidth || image.width || WIDTH;
	const imageHeight = image.naturalHeight || image.height || HEIGHT;
	const scale = Math.max(WIDTH / imageWidth, HEIGHT / imageHeight) * zoom;
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}

export function ThumbnailComposer({
	backgroundDataUrl,
	value,
	onChange,
	onExport,
}: {
	backgroundDataUrl: string | null;
	value: ThumbnailComposition;
	onChange: (next: ThumbnailComposition) => void;
	onExport: (dataUrl: string, format: "png" | "jpeg") => void;
}) {
	const te = useScopedT("editor");
	const ts = useScopedT("settings");
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
	const [logoError, setLogoError] = useState<string | null>(null);

	// Redraw whenever the settings, the background or the logo change. The image loads are async,
	// so a newer draw cancels an older one rather than painting over it out of order.
	useEffect(() => {
		let cancelled = false;
		const paint = async () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, WIDTH, HEIGHT);
			ctx.fillStyle = "#0f172a";
			ctx.fillRect(0, 0, WIDTH, HEIGHT);

			let background: HTMLImageElement | null = null;
			if (backgroundDataUrl) {
				try {
					background = await loadImage(backgroundDataUrl);
				} catch {
					background = null;
				}
			}
			if (cancelled) return;
			if (background) drawCover(ctx, background, value.backgroundZoom);

			if (logoDataUrl) {
				try {
					const logo = await loadImage(logoDataUrl);
					if (!cancelled) {
						const logoWidth = WIDTH * value.logoSize;
						const logoHeight = logoHeightOf(logo, logoWidth);
						const x = value.logoCorner.endsWith("left") ? PAD : WIDTH - PAD - logoWidth;
						const y = value.logoCorner.startsWith("top") ? PAD : HEIGHT - PAD - logoHeight;
						ctx.drawImage(logo, x, y, logoWidth, logoHeight);
					}
				} catch {
					// A broken logo simply does not draw; the headline and background still do.
				}
			}
			if (cancelled) return;

			ctx.font = `800 ${value.fontSize}px ${FONT_STACK}`;
			ctx.textBaseline = "alphabetic";
			ctx.textAlign =
				value.alignment === "left" ? "left" : value.alignment === "right" ? "right" : "center";
			const lines = wrapHeadline(ctx, value.headline, WIDTH - PAD * 2);
			const lineHeight = value.fontSize * 1.08;
			const lastBaseline = HEIGHT - PAD;
			const x =
				value.alignment === "left" ? PAD : value.alignment === "right" ? WIDTH - PAD : WIDTH / 2;
			lines.forEach((line, index) => {
				const y = lastBaseline - (lines.length - 1 - index) * lineHeight;
				if (value.outlineWidth > 0) {
					ctx.lineWidth = value.outlineWidth * 2;
					ctx.strokeStyle = value.outlineColor;
					ctx.strokeText(line, x, y);
				}
				ctx.fillStyle = value.textColor;
				ctx.fillText(line, x, y);
			});
		};
		void paint();
		return () => {
			cancelled = true;
		};
	}, [backgroundDataUrl, logoDataUrl, value]);

	const patch = useCallback(
		(next: Partial<ThumbnailComposition>) => onChange({ ...value, ...next }),
		[onChange, value],
	);

	const pickLogo = useCallback(
		(file: File | undefined) => {
			if (!file) return;
			setLogoError(null);
			const reader = new FileReader();
			reader.onload = () => {
				setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
				const path = (file as File & { path?: string }).path;
				patch({ logoPath: path ?? file.name });
			};
			reader.onerror = () => setLogoError(te("inspector.studioImageFailed"));
			reader.readAsDataURL(file);
		},
		[patch, te],
	);

	const exportImage = useCallback(
		(format: "png" | "jpeg") => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			onExport(canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.92), format);
		},
		[onExport],
	);

	return (
		<section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			<h3 style={{ margin: 0, font: "600 13px/1.3 var(--font-body)" }}>
				{te("inspector.studioComposer")}
			</h3>
			<canvas
				ref={canvasRef}
				width={WIDTH}
				height={HEIGHT}
				aria-label={te("inspector.studioCanvasAlt")}
				data-testid="studio-canvas"
				style={{
					width: "100%",
					height: "auto",
					borderRadius: 8,
					border: "1px solid var(--border-soft)",
				}}
			/>
			<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
					{te("inspector.studioHeadline")}
				</span>
				<textarea
					data-testid="studio-headline"
					value={value.headline}
					onChange={(event) => patch({ headline: event.target.value })}
					style={{
						font: "400 13px/1.4 var(--font-body)",
						background: "var(--surface-2)",
						color: "var(--fg-1)",
						border: "1px solid var(--border-soft)",
						borderRadius: 6,
						padding: "6px 8px",
						minHeight: 44,
						resize: "vertical",
					}}
				/>
			</label>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
				<SliderCell
					label={te("inspector.studioFontSize")}
					value={value.fontSize}
					min={24}
					max={160}
					step={2}
					suffix=" px"
					defaultValue={84}
					onChange={(fontSize) => patch({ fontSize })}
					onCommit={() => undefined}
				/>
				<SliderCell
					label={te("inspector.studioOutline")}
					value={value.outlineWidth}
					min={0}
					max={16}
					step={1}
					suffix=" px"
					defaultValue={5}
					onChange={(outlineWidth) => patch({ outlineWidth })}
					onCommit={() => undefined}
				/>
				<SliderCell
					label={te("inspector.studioBackgroundZoom")}
					value={value.backgroundZoom}
					min={1}
					max={2.5}
					step={0.05}
					decimals={2}
					defaultValue={1}
					onChange={(backgroundZoom) => patch({ backgroundZoom })}
					onCommit={() => undefined}
				/>
				<SliderCell
					label={te("inspector.studioLogoSize")}
					value={value.logoSize * 100}
					min={3}
					max={40}
					step={1}
					suffix="%"
					defaultValue={14}
					onChange={(percent) => patch({ logoSize: percent / 100 })}
					onCommit={() => undefined}
				/>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
						{te("inspector.studioTextColor")}
					</span>
					<input
						type="color"
						aria-label={te("inspector.studioTextColor")}
						value={value.textColor}
						onChange={(event) => patch({ textColor: event.target.value })}
					/>
				</label>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
						{te("inspector.studioOutlineColor")}
					</span>
					<input
						type="color"
						aria-label={te("inspector.studioOutlineColor")}
						value={value.outlineColor}
						onChange={(event) => patch({ outlineColor: event.target.value })}
					/>
				</label>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
						{te("inspector.studioAlignment")}
					</span>
					<select
						aria-label={te("inspector.studioAlignment")}
						value={value.alignment}
						onChange={(event) => patch({ alignment: event.target.value as ThumbnailAlignment })}
					>
						<option value="left">{ts("anchors.left")}</option>
						<option value="center">{te("inspector.studioAlignCenter")}</option>
						<option value="right">{ts("anchors.right")}</option>
					</select>
				</label>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
						{te("inspector.studioLogoCorner")}
					</span>
					<select
						aria-label={te("inspector.studioLogoCorner")}
						value={value.logoCorner}
						onChange={(event) => patch({ logoCorner: event.target.value as ThumbnailCorner })}
					>
						<option value="top-left">{ts("anchors.topLeft")}</option>
						<option value="top-right">{ts("anchors.topRight")}</option>
						<option value="bottom-left">{ts("anchors.bottomLeft")}</option>
						<option value="bottom-right">{ts("anchors.bottomRight")}</option>
					</select>
				</label>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<span style={{ font: "500 12px/1.3 var(--font-body)", color: "var(--fg-2)" }}>
						{te("inspector.studioLogo")}
					</span>
					<input
						type="file"
						accept="image/*"
						aria-label={te("inspector.studioLogo")}
						onChange={(event) => pickLogo(event.target.files?.[0])}
					/>
				</label>
			</div>
			{logoError ? (
				<p role="alert" style={{ margin: 0 }}>
					{logoError}
				</p>
			) : null}
			<div style={{ display: "flex", gap: 8 }}>
				<button type="button" data-testid="composer-export-png" onClick={() => exportImage("png")}>
					{te("inspector.studioExportPng")}
				</button>
				<button
					type="button"
					data-testid="composer-export-jpeg"
					onClick={() => exportImage("jpeg")}
				>
					{te("inspector.studioExportJpeg")}
				</button>
			</div>
		</section>
	);
}

function logoHeightOf(image: HTMLImageElement, width: number): number {
	const naturalWidth = image.naturalWidth || image.width || width;
	const naturalHeight = image.naturalHeight || image.height || width;
	return (naturalHeight / naturalWidth) * width;
}
