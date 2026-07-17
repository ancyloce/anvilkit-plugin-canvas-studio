import type { CanvasIR } from "@anvilkit/canvas-core";
import { buildCanvasSnapshotMeta } from "../state/snapshot-meta.js";
import type {
	CanvasSnapshotAdapter,
	CanvasSnapshotMeta,
} from "../types/types.js";

interface StoredSnapshot {
	readonly meta: CanvasSnapshotMeta;
	readonly ir: CanvasIR;
}

function freshSnapshotId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `snap-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Default in-memory implementation of {@link CanvasSnapshotAdapter}.
 * Lives for the lifetime of one plugin instance — suitable for tests,
 * demos, and "soft" undo across a session. Hosts that need durable
 * history should pass their own adapter via
 * `CreateCanvasStudioPluginOptions.canvasSnapshotAdapter`.
 */
export function inMemoryCanvasSnapshotAdapter(): CanvasSnapshotAdapter {
	const byDesign = new Map<string, StoredSnapshot[]>();

	function listFor(designId: string): StoredSnapshot[] {
		const existing = byDesign.get(designId);
		if (existing) return existing;
		const fresh: StoredSnapshot[] = [];
		byDesign.set(designId, fresh);
		return fresh;
	}

	return {
		save(designId, ir, meta) {
			const id = freshSnapshotId();
			const snapshot: StoredSnapshot = {
				meta: buildCanvasSnapshotMeta(
					id,
					designId,
					new Date().toISOString(),
					ir,
					meta?.label,
				),
				ir: structuredClone(ir),
			};
			listFor(designId).push(snapshot);
			return id;
		},
		list(designId) {
			return listFor(designId).map((s) => s.meta);
		},
		load(designId, snapshotId) {
			const hit = listFor(designId).find((s) => s.meta.id === snapshotId);
			return hit ? structuredClone(hit.ir) : null;
		},
		delete(designId, snapshotId) {
			const list = listFor(designId);
			const idx = list.findIndex((s) => s.meta.id === snapshotId);
			if (idx >= 0) list.splice(idx, 1);
		},
	};
}
