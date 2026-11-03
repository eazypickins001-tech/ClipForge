/**
 * Asset-level mutators, pure like the rest of `document/`.
 */
import type { AxcutDocument } from "../schema";

/**
 * Point an asset at a different file on disk — the missing-media case: the project still holds the
 * whole edit, and the user has the media somewhere else now.
 *
 * Only `originalPath` moves. The asset id, its label and every clip, trim, zoom, annotation and
 * audio take that reference it stay exactly as they were — that is the point. Relinking must not
 * look like a re-import, or the timeline would be rebuilt from the new file instead of restored.
 *
 * An unknown asset, or a path already in use, returns the SAME document, so the store can skip the
 * save and leave no empty undo step. Pure.
 */
export function relinkAsset(
	document: AxcutDocument,
	assetId: string,
	originalPath: string,
): AxcutDocument {
	const asset = document.assets.find((candidate) => candidate.id === assetId);
	if (!asset || asset.originalPath === originalPath) return document;
	return {
		...document,
		assets: document.assets.map((candidate) =>
			candidate.id === assetId ? { ...candidate, originalPath } : candidate,
		),
	};
}
