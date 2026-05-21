import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginRegistration,
	StudioSidebarUnregister,
} from "@anvilkit/core";
import { createModeSwitchAction } from "./actions/mode-switch-action.js";
import { inMemoryCanvasSnapshotAdapter } from "./adapters/in-memory-snapshot.js";
import { exportCanvasToAsset } from "./export/CanvasExportBridge.js";
import { createCanvasModeOverlay } from "./overlays/CanvasModeOverlay.js";
import { CANVAS_STUDIO_PLUGIN_META } from "./plugin-meta.js";
import { createDesignBlockQuickAdd } from "./quick-add/design-block-quick-add.js";
import { createDesignAssetResolver } from "./resolvers/design-asset-resolver.js";
import { createCanvasSnapshotBridge } from "./state/canvas-snapshot-bridge.js";
import { createCanvasModeStore } from "./state/mode-store.js";
import { createPreviewCache } from "./state/preview-cache.js";
import type {
	CanvasPersistenceAdapter,
	CanvasSnapshotAdapter,
} from "./types.js";

export interface CreateCanvasStudioPluginOptions {
	readonly adapter: CanvasPersistenceAdapter;
	/** Optional override for the Puck component type id. Defaults to `"DesignBlock"`. */
	readonly designBlockComponentType?: string;
	/**
	 * Optional canvas-snapshot store used by the version-history bridge.
	 * When omitted, the plugin falls back to an in-process adapter
	 * (`inMemoryCanvasSnapshotAdapter`). Hosts that want durable history
	 * — Postgres, IndexedDB, etc. — implement `CanvasSnapshotAdapter`
	 * and pass it here.
	 */
	readonly canvasSnapshotAdapter?: CanvasSnapshotAdapter;
}

/**
 * Wires the Canvas Studio integration into `<Studio>`:
 *
 * - Header action: toggle between Puck page mode and full-screen Canvas
 *   overlay.
 * - Overlay: mounts `<CanvasStudio>` when the toggle is on, persists the
 *   IR through the host-provided `CanvasPersistenceAdapter` on close,
 *   exports the stage to a preview URL, and patches the Puck DesignBlock
 *   it came from with `previewUrl` so the page renders the thumbnail
 *   when the user returns to Puck mode.
 * - Layer quick-add: inserts a `DesignBlock` placeholder into the Puck
 *   page and stages a fresh design id in the overlay store.
 * - `design://` asset resolver: hands back cached preview URLs for any
 *   `design://<designId>` reference encountered in the IR resolver chain.
 */
export function createCanvasStudioPlugin(
	options: CreateCanvasStudioPluginOptions,
): StudioPlugin {
	const modeStore = createCanvasModeStore();
	const previewCache = createPreviewCache();
	const designAssetResolver = createDesignAssetResolver(previewCache);
	const designBlockComponentType =
		options.designBlockComponentType ?? "DesignBlock";

	const modeSwitchAction = createModeSwitchAction({ modeStore });
	const designBlockQuickAdd = createDesignBlockQuickAdd({
		modeStore,
		componentType: designBlockComponentType,
	});

	// The overlay needs to dispatch a Puck `replace` against the live
	// PuckApi to write `previewUrl` back into the DesignBlock. We capture
	// the ctx in onInit and read it in `onCommitAndClose`.
	const ctxRef: { current: StudioPluginContext | null } = { current: null };

	const canvasSnapshotAdapter =
		options.canvasSnapshotAdapter ?? inMemoryCanvasSnapshotAdapter();
	const canvasSnapshotBridge = createCanvasSnapshotBridge({
		adapter: canvasSnapshotAdapter,
		getCtx: () => ctxRef.current,
	});

	const CanvasModeOverlay = createCanvasModeOverlay({
		modeStore,
		adapter: options.adapter,
		async onCommitAndClose({ designId, puckNodeId, artboardId, ir, stage }) {
			if (stage) {
				const exported = exportCanvasToAsset({
					stage,
					designId,
					previewCache,
					...(artboardId ? { artboardId } : {}),
					// Always seed the design's default bucket too so a bare
					// `design://<designId>` reference (the legacy form) keeps
					// rendering the most recently exported artboard.
					writeDefault: true,
				});
				if (puckNodeId) {
					patchDesignBlockPreview({
						ctx: ctxRef.current,
						puckNodeId,
						previewUrl: exported.previewUrl,
						artboardId: exported.artboardId,
						componentType: designBlockComponentType,
					});
				}
			}
			// Persist a version-history snapshot under the `canvas:`
			// keyspace and emit the bus event (inert today; forward-
			// compatible). Errors are swallowed with a log so a flaky
			// snapshot store cannot block the user from closing the
			// overlay.
			try {
				await canvasSnapshotBridge.saveSnapshot(designId, ir);
			} catch (err) {
				ctxRef.current?.log?.(
					"warn",
					"Canvas snapshot save failed; commit continued.",
					{ error: err instanceof Error ? err.message : String(err) },
				);
			}
		},
	});

	return {
		meta: CANVAS_STUDIO_PLUGIN_META,
		register() {
			let quickAddUnregister: StudioSidebarUnregister | null = null;
			const registration: StudioPluginRegistration = {
				meta: CANVAS_STUDIO_PLUGIN_META,
				headerActions: [modeSwitchAction],
				overlays: [
					{
						id: "canvas-studio:overlay",
						placement: "viewport",
						component: CanvasModeOverlay,
						order: 10,
					},
				],
				hooks: {
					onInit(ctx) {
						ctxRef.current = ctx;
						ctx.registerAssetResolver?.(designAssetResolver);
						quickAddUnregister =
							ctx.registerLayerQuickAdd?.(designBlockQuickAdd) ?? null;
					},
					onDestroy() {
						quickAddUnregister?.();
						quickAddUnregister = null;
						previewCache.clear();
						ctxRef.current = null;
					},
				},
			};
			return registration;
		},
	};
}

function patchDesignBlockPreview(input: {
	ctx: StudioPluginContext | null;
	puckNodeId: string;
	previewUrl: string;
	artboardId: string | undefined;
	componentType: string;
}): void {
	const ctx = input.ctx;
	if (!ctx) return;
	const api = ctx.getPuckApi?.();
	if (!api || typeof api !== "object") return;
	const appState = (api as { appState?: { data?: unknown } }).appState;
	const data = (appState?.data ?? null) as {
		content?: ReadonlyArray<{
			type?: string;
			props?: Record<string, unknown> & { id?: string };
		}>;
	} | null;
	if (!data?.content) return;
	const index = data.content.findIndex(
		(item) =>
			item.type === input.componentType && item.props?.id === input.puckNodeId,
	);
	if (index < 0) return;
	const target = data.content[index];
	if (!target) return;
	const nextProps = {
		...(target.props ?? {}),
		previewUrl: input.previewUrl,
		...(input.artboardId !== undefined ? { artboardId: input.artboardId } : {}),
	};
	const dispatch = (api as { dispatch?: (action: unknown) => void }).dispatch;
	dispatch?.({
		type: "replace",
		destinationIndex: index,
		destinationZone: "default-zone",
		data: {
			...target,
			props: nextProps,
		},
	});
}
