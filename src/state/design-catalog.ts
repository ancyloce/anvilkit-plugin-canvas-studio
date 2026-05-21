/**
 * Per-plugin-instance cache of `(designId → artboards[])`, used to bridge
 * the canvas editor's live IR to `@anvilkit/design-block`'s
 * `resolveFields` callback. Populated by `CanvasModeOverlay` whenever it
 * loads an IR or receives an `onChange` from `<CanvasStudio>`; consulted
 * by the plugin's `onInit` hook which registers a `setArtboardCatalog`
 * lookup.
 *
 * The DesignBlock Puck inspector calls `listArtboards(designId)`
 * synchronously inside `resolveFields`, so this cache cannot itself be
 * async. Hosts that need durable artboard catalogs (e.g. for designs the
 * user has never opened in this session) should layer their own
 * persistence behind `CanvasPersistenceAdapter` and prime the catalog
 * once the IR is loaded.
 *
 * Lifetime is the lifetime of one `createCanvasStudioPlugin(...)`
 * instance; `onDestroy` clears the cache.
 */
export interface ArtboardCatalogEntry {
	readonly id: string;
	readonly label?: string;
}

export interface DesignCatalog {
	get: (designId: string) => ReadonlyArray<ArtboardCatalogEntry> | undefined;
	set: (designId: string, entries: ReadonlyArray<ArtboardCatalogEntry>) => void;
	deleteDesign: (designId: string) => void;
	clear: () => void;
}

export function createDesignCatalog(): DesignCatalog {
	const cache = new Map<string, ReadonlyArray<ArtboardCatalogEntry>>();
	return {
		get(designId) {
			return cache.get(designId);
		},
		set(designId, entries) {
			// Defensive copy so a later mutation of the caller's array OR
			// of the entry objects themselves can't silently corrupt the
			// cache. `readonly` is compile-time only; clone the leaf fields.
			const cloned: ArtboardCatalogEntry[] = entries.map((e) =>
				e.label !== undefined ? { id: e.id, label: e.label } : { id: e.id },
			);
			cache.set(designId, cloned);
		},
		deleteDesign(designId) {
			cache.delete(designId);
		},
		clear() {
			cache.clear();
		},
	};
}
