import type { IRAssetResolver } from "@anvilkit/core";
import type { PreviewCache } from "../state/preview-cache.js";

export const DESIGN_REFERENCE_PREFIX = "design://";

/**
 * IR asset resolver for the `design://` URL scheme.
 *
 * Supported URL forms:
 *
 * - `design://<designId>` — design-level preview (default bucket; falls
 *   back to any artboard-specific entry when no default is cached).
 * - `design://<designId>/<artboardId>` — artboard-specific preview.
 * - `design://<designId>?artboard=<id>` — legacy back-compat form; same
 *   semantics as the path form above.
 *
 * Returns `null` for unknown design / artboard ids and for unrelated
 * URLs (so the next resolver in the chain can try).
 */
export function createDesignAssetResolver(
	previewCache: PreviewCache,
): IRAssetResolver {
	return (url) => {
		if (!url.startsWith(DESIGN_REFERENCE_PREFIX)) return null;
		const after = url.slice(DESIGN_REFERENCE_PREFIX.length);
		const queryStart = after.indexOf("?");
		const beforeQuery = queryStart === -1 ? after : after.slice(0, queryStart);
		const queryString = queryStart === -1 ? "" : after.slice(queryStart + 1);
		const slashIndex = beforeQuery.indexOf("/");
		const designId =
			slashIndex === -1 ? beforeQuery : beforeQuery.slice(0, slashIndex);
		if (designId.length === 0) return null;
		const pathArtboardId =
			slashIndex === -1 ? "" : beforeQuery.slice(slashIndex + 1);
		const queryArtboardId = parseArtboardFromQuery(queryString);
		const artboardId =
			pathArtboardId.length > 0
				? pathArtboardId
				: queryArtboardId.length > 0
					? queryArtboardId
					: undefined;
		const previewUrl = previewCache.get(designId, artboardId);
		if (!previewUrl) return null;
		return { url: previewUrl };
	};
}

function parseArtboardFromQuery(qs: string): string {
	if (qs.length === 0) return "";
	for (const pair of qs.split("&")) {
		const eq = pair.indexOf("=");
		if (eq === -1) continue;
		const key = pair.slice(0, eq);
		if (key === "artboard") {
			const raw = pair.slice(eq + 1);
			try {
				return decodeURIComponent(raw);
			} catch {
				// Malformed percent-escape (e.g. lone `%`). Treat as no
				// artboard id so the resolver returns null cleanly rather
				// than throwing through the export/asset-resolution path.
				return "";
			}
		}
	}
	return "";
}
