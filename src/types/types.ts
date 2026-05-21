import type { CanvasIR } from "@anvilkit/canvas-core";

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
 * One historical snapshot of a canvas design. Mirrors the shape that
 * `@anvilkit/plugin-version-history` uses for Puck PageIR snapshots so
 * the two histories can later share UI without reshaping data.
 */
export interface CanvasSnapshotMeta {
	readonly id: string;
	readonly designId: string;
	readonly savedAt: string;
	readonly label?: string;
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
