/**
 * Per-plugin-instance preview store keyed by `(designId, artboardId)`.
 * Populated by `exportCanvasToAsset`; consulted by the `design://` asset
 * resolver (export path) and by the DesignBlock display seam (editor path).
 *
 * Each entry holds two representations of the same exported preview:
 *
 * - **`dataUrl`** — the self-contained `data:image/...;base64,...` string the
 *   stage exported. Returned by {@link PreviewCache.get}; this is what the
 *   `design://` resolver hands the export pipeline, because a static HTML/React
 *   export must embed bytes that survive the session.
 * - **`objectUrl`** — a `blob:` URL minted from the same bytes via
 *   `URL.createObjectURL`. Returned by {@link PreviewCache.getObjectUrl}; this
 *   is what the live DesignBlock renders. Keeping the heavy base64 string out of
 *   the Puck node props (only a tiny `design://` reference is written back) is
 *   what stops Puck's undo history from retaining a full preview snapshot per
 *   edit — see `performance-report-verification`.
 *
 * Object URLs are revoked when their entry is replaced or removed, so the held
 * blob count is bounded by the number of distinct `(designId, artboardId)`
 * pairs, not by edit count. In a non-browser environment (`URL.createObjectURL`
 * absent, e.g. some test runners) `objectUrl` falls back to the data URL so the
 * display path still resolves something renderable.
 *
 * `artboardId` is optional — entries without one live under a default bucket
 * (`__default__`) so legacy single-preview designs and the "first artboard"
 * fall back when no specific artboard is requested.
 *
 * Lifetime is the lifetime of one `createCanvasStudioPlugin(...)` instance; the
 * plugin's `onDestroy` calls {@link PreviewCache.clear}, which revokes every
 * object URL. Hosts that need durable preview persistence should mirror the
 * exported bytes into the `CanvasPersistenceAdapter` or `plugin-asset-manager`
 * — this store is only the in-memory join between the export bridge, the
 * resolver, and the DesignBlock display.
 */

export const PREVIEW_DEFAULT_BUCKET = "__default__";

function keyOf(designId: string, artboardId?: string): string {
	const ab =
		artboardId && artboardId.length > 0 ? artboardId : PREVIEW_DEFAULT_BUCKET;
	return `${designId}::${ab}`;
}

interface PreviewEntry {
	/** Self-contained data URL — fed to the `design://` export resolver. */
	readonly dataUrl: string;
	/** `blob:` URL for live display, or the data URL when object URLs are unavailable. */
	readonly objectUrl: string;
	/** True only when `objectUrl` is a real revocable `blob:` URL. */
	readonly revocable: boolean;
}

/**
 * Convert a `data:...;base64,...` URL into a `blob:` object URL. Returns the
 * input data URL unchanged when the platform lacks `URL.createObjectURL`/`Blob`
 * or the data URL cannot be decoded — the caller then stores a non-revocable
 * entry. Never throws.
 */
function toObjectUrl(dataUrl: string): { url: string; revocable: boolean } {
	if (
		typeof URL === "undefined" ||
		typeof URL.createObjectURL !== "function" ||
		typeof Blob === "undefined"
	) {
		return { url: dataUrl, revocable: false };
	}
	try {
		const blob = dataUrlToBlob(dataUrl);
		if (!blob) return { url: dataUrl, revocable: false };
		return { url: URL.createObjectURL(blob), revocable: true };
	} catch {
		return { url: dataUrl, revocable: false };
	}
}

function dataUrlToBlob(dataUrl: string): Blob | null {
	const comma = dataUrl.indexOf(",");
	if (!dataUrl.startsWith("data:") || comma === -1) return null;
	const header = dataUrl.slice(5, comma); // between "data:" and ","
	const isBase64 = /;base64$/i.test(header);
	const mime = header.replace(/;base64$/i, "") || "application/octet-stream";
	const payload = dataUrl.slice(comma + 1);
	if (isBase64) {
		if (typeof atob !== "function") return null;
		const binary = atob(payload);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
		return new Blob([bytes], { type: mime });
	}
	return new Blob([decodeURIComponent(payload)], { type: mime });
}

function revoke(entry: PreviewEntry | undefined): void {
	if (
		entry?.revocable &&
		typeof URL !== "undefined" &&
		typeof URL.revokeObjectURL === "function"
	) {
		try {
			URL.revokeObjectURL(entry.objectUrl);
		} catch {
			// Best-effort: a double revoke / closed document must not throw
			// through the commit or teardown path.
		}
	}
}

export interface PreviewCache {
	/**
	 * Look up the **data URL** for a `(designId, artboardId)` pair (the
	 * self-contained form used by the `design://` export resolver). When
	 * `artboardId` is omitted, returns the default bucket entry. When the
	 * default is also missing, returns any *one* of the design's
	 * artboard-specific entries (insertion order) so a bare
	 * `design://<designId>` URL still renders something useful.
	 */
	get: (designId: string, artboardId?: string) => string | undefined;
	/**
	 * Look up the **object (`blob:`) URL** for a `(designId, artboardId)` pair —
	 * the form the live DesignBlock renders. Same fallback semantics as
	 * {@link get}. Falls back to the data URL when the platform cannot mint
	 * object URLs.
	 */
	getObjectUrl: (designId: string, artboardId?: string) => string | undefined;
	set: (designId: string, previewUrl: string, artboardId?: string) => void;
	delete: (designId: string, artboardId?: string) => void;
	/** Removes every entry for `designId` (every artboard + default). */
	deleteDesign: (designId: string) => void;
	clear: () => void;
}

export function createPreviewCache(): PreviewCache {
	const cache = new Map<string, PreviewEntry>();

	function entryFor(
		designId: string,
		artboardId?: string,
	): PreviewEntry | undefined {
		if (artboardId !== undefined && artboardId.length > 0) {
			const hit = cache.get(keyOf(designId, artboardId));
			if (hit !== undefined) return hit;
			// Fall back to the design's default bucket so legacy single-preview
			// entries still resolve when the caller asks for a specific
			// (uncached) artboard.
			return cache.get(keyOf(designId));
		}
		const defaultEntry = cache.get(keyOf(designId));
		if (defaultEntry !== undefined) return defaultEntry;
		// Fall back to the first artboard-specific entry for this design.
		const prefix = `${designId}::`;
		for (const [k, v] of cache) {
			if (k.startsWith(prefix) && k !== keyOf(designId)) return v;
		}
		return undefined;
	}

	return {
		get(designId, artboardId) {
			return entryFor(designId, artboardId)?.dataUrl;
		},
		getObjectUrl(designId, artboardId) {
			return entryFor(designId, artboardId)?.objectUrl;
		},
		set(designId, previewUrl, artboardId) {
			const key = keyOf(designId, artboardId);
			revoke(cache.get(key));
			const { url, revocable } = toObjectUrl(previewUrl);
			cache.set(key, { dataUrl: previewUrl, objectUrl: url, revocable });
		},
		delete(designId, artboardId) {
			const key = keyOf(designId, artboardId);
			revoke(cache.get(key));
			cache.delete(key);
		},
		deleteDesign(designId) {
			const prefix = `${designId}::`;
			for (const k of [...cache.keys()]) {
				if (k.startsWith(prefix)) {
					revoke(cache.get(k));
					cache.delete(k);
				}
			}
		},
		clear() {
			for (const entry of cache.values()) revoke(entry);
			cache.clear();
		},
	};
}
