import type { IRAssetResolver } from "@anvilkit/core";
import type { PreviewCache } from "../state/preview-cache.js";

export const DESIGN_REFERENCE_PREFIX = "design://";

/**
 * IR asset resolver for the `design://` URL scheme.
 *
 * `design://<designId>` (with an optional `?artboard=<id>` suffix)
 * resolves to whatever preview URL the export bridge cached for that
 * design id. Returns `null` for unknown design ids or unrelated URLs
 * (so the next resolver in the chain can try).
 */
export function createDesignAssetResolver(
	previewCache: PreviewCache,
): IRAssetResolver {
	return (url) => {
		if (!url.startsWith(DESIGN_REFERENCE_PREFIX)) return null;
		const after = url.slice(DESIGN_REFERENCE_PREFIX.length);
		const queryStart = after.indexOf("?");
		const designId = queryStart === -1 ? after : after.slice(0, queryStart);
		if (designId.length === 0) return null;
		const previewUrl = previewCache.get(designId);
		if (!previewUrl) return null;
		return { url: previewUrl };
	};
}
