/**
 * Per-plugin-instance cache of preview data-URLs keyed by
 * `(designId, artboardId)`. Populated by `exportCanvasToAsset`; consulted
 * by the `design://` asset resolver.
 *
 * `artboardId` is optional — entries without one live under a default
 * bucket (`__default__`) so legacy single-preview designs and the
 * "first artboard" fall back when no specific artboard is requested.
 *
 * Lifetime is the lifetime of one `createCanvasStudioPlugin(...)`
 * instance. Hosts that need durable preview persistence should mirror
 * `previewUrl` into the Puck node props (the overlay's commit flow
 * already does this), into the `CanvasPersistenceAdapter`, or into
 * `plugin-asset-manager` — this cache is only the in-memory join point
 * between the export bridge and the resolver.
 */

export const PREVIEW_DEFAULT_BUCKET = "__default__";

function keyOf(designId: string, artboardId?: string): string {
	const ab =
		artboardId && artboardId.length > 0 ? artboardId : PREVIEW_DEFAULT_BUCKET;
	return `${designId}::${ab}`;
}

export interface PreviewCache {
	/**
	 * Look up the preview URL for a `(designId, artboardId)` pair. When
	 * `artboardId` is omitted, returns the default bucket entry. When the
	 * default is also missing, returns any *one* of the design's
	 * artboard-specific entries (insertion order) so a bare
	 * `design://<designId>` URL still renders something useful for legacy
	 * DesignBlock props.
	 */
	get: (designId: string, artboardId?: string) => string | undefined;
	set: (designId: string, previewUrl: string, artboardId?: string) => void;
	delete: (designId: string, artboardId?: string) => void;
	/** Removes every entry for `designId` (every artboard + default). */
	deleteDesign: (designId: string) => void;
	clear: () => void;
}

export function createPreviewCache(): PreviewCache {
	const cache = new Map<string, string>();
	return {
		get(designId, artboardId) {
			if (artboardId !== undefined && artboardId.length > 0) {
				const hit = cache.get(keyOf(designId, artboardId));
				if (hit !== undefined) return hit;
				// Fall back to the design's default bucket so legacy
				// single-preview entries still resolve when the caller
				// asks for a specific (uncached) artboard.
				return cache.get(keyOf(designId));
			}
			const defaultUrl = cache.get(keyOf(designId));
			if (defaultUrl !== undefined) return defaultUrl;
			// Fall back to the first artboard-specific entry for this design.
			const prefix = `${designId}::`;
			for (const [k, v] of cache) {
				if (k.startsWith(prefix) && k !== keyOf(designId)) return v;
			}
			return undefined;
		},
		set(designId, previewUrl, artboardId) {
			cache.set(keyOf(designId, artboardId), previewUrl);
		},
		delete(designId, artboardId) {
			cache.delete(keyOf(designId, artboardId));
		},
		deleteDesign(designId) {
			const prefix = `${designId}::`;
			for (const k of [...cache.keys()]) {
				if (k.startsWith(prefix)) cache.delete(k);
			}
		},
		clear() {
			cache.clear();
		},
	};
}
