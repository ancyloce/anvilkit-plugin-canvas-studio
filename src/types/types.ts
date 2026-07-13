import type { CanvasIR, CanvasIRVersion } from "@anvilkit/canvas-core";

export type MaybePromise<T> = T | Promise<T>;

export interface CanvasDesignMeta {
	readonly id: string;
	readonly title?: string;
	readonly updatedAt: string;
}

/**
 * Host-provided persistence layer for canvas designs. Hosts implement
 * `save`/`load`/`list`/`delete` against whatever store fits their
 * deployment (Postgres, S3, IndexedDB, etc.). The plugin ships two
 * default implementations: `inMemoryCanvasAdapter` (transient) and
 * `localStorageCanvasAdapter` (browser-only, demo-grade).
 */
export interface CanvasPersistenceAdapter {
	readonly save: (designId: string, ir: CanvasIR) => MaybePromise<void>;
	readonly load: (designId: string) => MaybePromise<CanvasIR | null>;
	readonly list: () => MaybePromise<readonly CanvasDesignMeta[]>;
	readonly delete?: (designId: string) => MaybePromise<void>;
}

/**
 * Export-relevant structural summary of a saved snapshot (FR-073): how many
 * pages it has, and which of them are campaign-resize variants of another
 * page (`CanvasPage.variantSource`, FR-061) — the metadata a version-history
 * UI needs to show "this version targets Instagram Post + LinkedIn Banner"
 * without materializing the full IR or running an actual export.
 */
export interface CanvasSnapshotExportMeta {
	readonly pageCount: number;
	readonly variants: ReadonlyArray<{
		readonly pageId: string;
		readonly presetId: string;
		readonly presetVersion: string;
	}>;
}

/**
 * One historical snapshot of a canvas design. Mirrors the shape that
 * `@anvilkit/plugin-version-history` uses for Puck PageIR snapshots so
 * the two histories can later share UI without reshaping data.
 */
export interface CanvasSnapshotMeta {
	readonly id: string;
	readonly designId: string;
	readonly savedAt: string;
	readonly label?: string;
	/** `CanvasIR.version` at save time (FR-073). */
	readonly irVersion: CanvasIRVersion;
	/** Asset ids referenced by the saved IR (FR-073) — ids only, never the full `CanvasAssetRef` records. */
	readonly assetIds: readonly string[];
	/**
	 * `CanvasIR.metadata.brandId` at save time (FR-073), if the design used a
	 * brand kit. A reference only — never the full `BrandKitDefinition`,
	 * consistent with "IR references tokens, not brand kits" (canvas-m2-005).
	 */
	readonly brandKitId?: string;
	/** Export-relevant structural summary (FR-073). See {@link CanvasSnapshotExportMeta}. */
	readonly exportMeta: CanvasSnapshotExportMeta;
}

/**
 * Persistence layer for canvas snapshots — the `canvas:` keyspace
 * analogue of `plugin-version-history`'s `SnapshotAdapter`. Implements
 * the same shape but typed for `CanvasIR` so a single host can wire
 * both Puck PageIR history and canvas design history into compatible
 * stores. Hosts that don't need durable canvas history can omit the
 * option entirely — the plugin falls back to an in-memory adapter.
 */
export interface CanvasSnapshotAdapter {
	readonly save: (
		designId: string,
		ir: CanvasIR,
		meta?: { readonly label?: string },
	) => MaybePromise<string>;
	readonly list: (
		designId: string,
	) => MaybePromise<readonly CanvasSnapshotMeta[]>;
	readonly load: (
		designId: string,
		snapshotId: string,
	) => MaybePromise<CanvasIR | null>;
	readonly delete?: (
		designId: string,
		snapshotId: string,
	) => MaybePromise<void>;
}
