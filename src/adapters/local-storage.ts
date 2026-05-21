import type { CanvasIR } from "@anvilkit/canvas-core";
import type { CanvasDesignMeta, CanvasPersistenceAdapter } from "../types/types.js";

export interface LocalStorageCanvasAdapterOptions {
	readonly namespace: string;
}

/**
 * Browser `localStorage`-backed design store. Per-save snapshots — no
 * delta compression. One design per key under
 * `<namespace>:designs:<id>`, plus an index at `<namespace>:designs:index`.
 *
 * Throws if `globalThis.localStorage` is missing (SSR / Node).
 */
export function localStorageCanvasAdapter(
	options: LocalStorageCanvasAdapterOptions,
): CanvasPersistenceAdapter {
	const indexKey = `${options.namespace}:designs:index`;
	const recordKey = (id: string) => `${options.namespace}:designs:${id}`;

	const getStorage = (): Storage => {
		if (typeof globalThis.localStorage === "undefined") {
			throw new Error(
				"localStorageCanvasAdapter requires globalThis.localStorage.",
			);
		}
		return globalThis.localStorage;
	};

	const readIndex = (storage: Storage): CanvasDesignMeta[] => {
		const raw = storage.getItem(indexKey);
		if (raw === null) return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as CanvasDesignMeta[]) : [];
		} catch {
			return [];
		}
	};

	const writeIndex = (storage: Storage, entries: CanvasDesignMeta[]): void => {
		storage.setItem(indexKey, JSON.stringify(entries));
	};

	return {
		save(designId, ir) {
			const storage = getStorage();
			storage.setItem(recordKey(designId), JSON.stringify(ir));
			const entries = readIndex(storage).filter((e) => e.id !== designId);
			entries.push({
				id: designId,
				title: ir.title,
				updatedAt: ir.metadata.updatedAt,
			});
			writeIndex(storage, entries);
		},
		load(designId) {
			const storage = getStorage();
			const raw = storage.getItem(recordKey(designId));
			if (raw === null) return null;
			try {
				return JSON.parse(raw) as CanvasIR;
			} catch {
				return null;
			}
		},
		list() {
			return readIndex(getStorage());
		},
		delete(designId) {
			const storage = getStorage();
			storage.removeItem(recordKey(designId));
			const entries = readIndex(storage).filter((e) => e.id !== designId);
			writeIndex(storage, entries);
		},
	};
}
