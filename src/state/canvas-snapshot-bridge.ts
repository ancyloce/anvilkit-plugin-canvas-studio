import type { CanvasIR } from "@anvilkit/canvas-core";
import type { StudioPluginContext } from "@anvilkit/core";
import type { CanvasSnapshotAdapter, CanvasSnapshotMeta } from "../types/types.js";

export const CANVAS_KEYSPACE = "canvas";

export const SAVE_REQUESTED_EVENT = "version-history:save-requested";
export const OPEN_REQUESTED_EVENT = "version-history:open-requested";

/**
 * Payload shape emitted on the Studio event bus when a canvas-mode
 * save or open is requested. The `keyspace` field is the canonical
 * namespace tag — `plugin-version-history` (or any future bridge UI)
 * can read it to distinguish canvas history from Puck PageIR history.
 *
 * The bus itself is currently inert in `@anvilkit/core` — see
 * `packages/core/src/types/plugin.ts:208-217`. The events are still
 * emitted so the contract is in place when delivery ships.
 */
export interface CanvasVersionHistoryEventPayload {
	readonly keyspace: typeof CANVAS_KEYSPACE;
	readonly designId: string;
	/** Snapshot id — only present on `save-requested` after persistence succeeds. */
	readonly snapshotId?: string;
}

export interface CanvasSnapshotBridge {
	/**
	 * Persist a snapshot of the current canvas IR under
	 * `canvas:<designId>` and emit `version-history:save-requested`
	 * with the canvas keyspace payload. Returns the new snapshot id.
	 */
	readonly saveSnapshot: (
		designId: string,
		ir: CanvasIR,
		options?: { readonly label?: string },
	) => Promise<string>;
	/**
	 * Emit `version-history:open-requested` for the design. The
	 * snapshot picker UI is deferred to Iter 3 (per the plan); for
	 * now the event fires for forward compatibility and the bridge
	 * also returns the current snapshot list so callers can render
	 * a minimal picker themselves.
	 */
	readonly requestOpen: (
		designId: string,
	) => Promise<readonly CanvasSnapshotMeta[]>;
	readonly listSnapshots: (
		designId: string,
	) => Promise<readonly CanvasSnapshotMeta[]>;
	readonly loadSnapshot: (
		designId: string,
		snapshotId: string,
	) => Promise<CanvasIR | null>;
	readonly deleteSnapshot: (
		designId: string,
		snapshotId: string,
	) => Promise<void>;
}

export interface CreateCanvasSnapshotBridgeOptions {
	readonly adapter: CanvasSnapshotAdapter;
	/**
	 * Returns the live `StudioPluginContext` so the bridge can call
	 * `ctx.emit(...)` at fire time. Wrapped in a getter because the
	 * ctx isn't available until `onInit` runs, but the bridge is
	 * constructed earlier (inside `createCanvasStudioPlugin`).
	 */
	readonly getCtx: () => StudioPluginContext | null;
}

export function createCanvasSnapshotBridge(
	options: CreateCanvasSnapshotBridgeOptions,
): CanvasSnapshotBridge {
	const { adapter, getCtx } = options;

	async function saveSnapshot(
		designId: string,
		ir: CanvasIR,
		opts?: { readonly label?: string },
	): Promise<string> {
		const id = await Promise.resolve(
			adapter.save(
				designId,
				ir,
				opts?.label !== undefined ? { label: opts.label } : undefined,
			),
		);
		const payload: CanvasVersionHistoryEventPayload = {
			keyspace: CANVAS_KEYSPACE,
			designId,
			snapshotId: id,
		};
		getCtx()?.emit(SAVE_REQUESTED_EVENT, payload);
		return id;
	}

	async function requestOpen(
		designId: string,
	): Promise<readonly CanvasSnapshotMeta[]> {
		const payload: CanvasVersionHistoryEventPayload = {
			keyspace: CANVAS_KEYSPACE,
			designId,
		};
		getCtx()?.emit(OPEN_REQUESTED_EVENT, payload);
		return Promise.resolve(adapter.list(designId));
	}

	function listSnapshots(designId: string) {
		return Promise.resolve(adapter.list(designId));
	}

	function loadSnapshot(designId: string, snapshotId: string) {
		return Promise.resolve(adapter.load(designId, snapshotId));
	}

	async function deleteSnapshot(
		designId: string,
		snapshotId: string,
	): Promise<void> {
		if (!adapter.delete) return;
		await Promise.resolve(adapter.delete(designId, snapshotId));
	}

	return {
		saveSnapshot,
		requestOpen,
		listSnapshots,
		loadSnapshot,
		deleteSnapshot,
	};
}
