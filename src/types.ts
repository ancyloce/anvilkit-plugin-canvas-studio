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
