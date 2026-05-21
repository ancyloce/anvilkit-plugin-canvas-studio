import type { CanvasIR } from "@anvilkit/canvas-core";
import type { CanvasDesignMeta, CanvasPersistenceAdapter } from "../types.js";

/**
 * Transient in-process design store. The IR is cloned on save so callers
 * cannot mutate the stored copy. Intended for tests and short-lived demo
 * sessions — production hosts should provide their own adapter.
 */
export function inMemoryCanvasAdapter(): CanvasPersistenceAdapter {
	const designs = new Map<string, CanvasIR>();
	return {
		save(designId, ir) {
			designs.set(designId, cloneIR(ir));
		},
		load(designId) {
			const stored = designs.get(designId);
			return stored ? cloneIR(stored) : null;
		},
		list() {
			const out: CanvasDesignMeta[] = [];
			for (const [id, ir] of designs.entries()) {
				out.push({ id, title: ir.title, updatedAt: ir.metadata.updatedAt });
			}
			return out;
		},
		delete(designId) {
			designs.delete(designId);
		},
	};
}

function cloneIR(ir: CanvasIR): CanvasIR {
	return JSON.parse(JSON.stringify(ir)) as CanvasIR;
}
