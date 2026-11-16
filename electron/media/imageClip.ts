// Still images as clips.
//
// The editor's decode pipeline is a video pipeline: the compositor and the preview both read a
// media file through ffmpeg/WebCodecs, so a PNG cannot be an asset on its own. The bundled ffmpeg
// can loop a still, though, so an imported image becomes a short H.264 proxy (5 s, 30 fps) next to
// the user's data. Everything downstream — thumbnail, timeline, trim, transform, export — then
// works exactly as it does for a recording, and no native decoder or preview path changes.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveFfmpeg } from "./audioPeaks";

export const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".bmp",
	".gif",
	".tif",
	".tiff",
]);

/** How long a still stays on the timeline. Trim handles the rest. */
export const STILL_DURATION_SEC = 5;
const STILL_FPS = 30;
/** The LGPL build ships libopenh264, not libx264 (see `extensionClip.ts`). */
const VIDEO_ENCODER = "libopenh264";

export function isImagePath(filePath: string): boolean {
	return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * The ffmpeg arguments, pure so the shape can be asserted. `scale` only rounds an odd pixel off:
 * H.264 needs even dimensions, and the image's own size is the framing we want to keep.
 */
export function imageClipArgs(imagePath: string, outPath: string): string[] {
	const duration = STILL_DURATION_SEC.toFixed(3);
	return [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-loop",
		"1",
		"-i",
		imagePath,
		"-t",
		duration,
		"-r",
		String(STILL_FPS),
		"-vf",
		"scale=trunc(iw/2)*2:trunc(ih/2)*2",
		"-c:v",
		VIDEO_ENCODER,
		"-pix_fmt",
		"yuv420p",
		"-an",
		outPath,
	];
}

export interface StillVideo {
	/** The proxy's absolute path. */
	path: string;
	/** The picked image's own name, for the media-library label. */
	name: string;
}

/**
 * The still proxy for `imagePath`, generating it once. Keyed by the image's path and mtime, so
 * re-importing the same file reuses the proxy and editing the image produces a new one.
 */
export async function ensureImageVideo(
	imagePath: string,
	outDir: string,
): Promise<StillVideo | null> {
	const ffmpeg = resolveFfmpeg();
	if (!ffmpeg) return null;
	let mtimeMs = 0;
	try {
		mtimeMs = (await fs.stat(imagePath)).mtimeMs;
	} catch {
		return null;
	}
	const key = crypto
		.createHash("sha1")
		.update(`${imagePath}:${mtimeMs}`)
		.digest("hex")
		.slice(0, 20);
	const outPath = path.join(outDir, `still-${key}.mp4`);
	try {
		await fs.access(outPath);
		return { path: outPath, name: path.basename(imagePath) };
	} catch {
		// Not generated yet.
	}
	await fs.mkdir(outDir, { recursive: true });
	const ok = await runFfmpeg(ffmpeg, imageClipArgs(imagePath, outPath));
	if (!ok) {
		await fs.rm(outPath, { force: true }).catch(() => undefined);
		return null;
	}
	return { path: outPath, name: path.basename(imagePath) };
}

function runFfmpeg(ffmpeg: string, args: string[]): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(ffmpeg, args, { windowsHide: true });
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr = `${stderr}${String(chunk)}`.slice(-4000);
		});
		child.on("error", () => resolve(false));
		child.on("close", (code) => {
			if (code !== 0 && stderr) console.warn("[images] ffmpeg:", stderr.trim());
			resolve(code === 0);
		});
	});
}
