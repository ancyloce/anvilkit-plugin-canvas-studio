/**
 * Per-plugin-instance cache of `designId -> previewUrl`. Populated by
 * `exportCanvasToAsset`; consulted by the `design://` asset resolver.
 *
 * Lifetime is the lifetime of one `createCanvasStudioPlugin(...)`
 * instance. Hosts that need durable preview persistence should mirror
 * `previewUrl` into the Puck node props (the overlay's commit flow
 * already does this), into the `CanvasPersistenceAdapter`, or into
 * `plugin-asset-manager` — this cache is only the in-memory join point
 * between the export bridge and the resolver.
 */
export interface PreviewCache {
	get: (designId: string) => string | undefined;
	set: (designId: string, previewUrl: string) => void;
	delete: (designId: string) => void;
	clear: () => void;
}

export function createPreviewCache(): PreviewCache {
	const cache = new Map<string, string>();
	return {
		get(designId) {
			return cache.get(designId);
		},
		set(designId, previewUrl) {
			cache.set(designId, previewUrl);
		},
		delete(designId) {
			cache.delete(designId);
		},
		clear() {
			cache.clear();
		},
	};
}
