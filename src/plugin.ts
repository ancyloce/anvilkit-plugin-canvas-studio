import type { CanvasAssetRef } from "@anvilkit/canvas-core";
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginRegistration,
	StudioSidebarUnregister,
} from "@anvilkit/core";
import {
	CANVAS_OPEN_EVENT,
	type OpenCanvasDetail,
	setArtboardCatalog,
} from "@anvilkit/design-block";
import { createModeSwitchAction } from "./actions/mode-switch-action.js";
import { inMemoryCanvasSnapshotAdapter } from "./adapters/in-memory-snapshot.js";
import { exportAllArtboards } from "./export/CanvasExportBridge.js";
import { CANVAS_STUDIO_PLUGIN_META } from "./meta.js";
import { createCanvasModeOverlay } from "./overlays/CanvasModeOverlay.js";
import { createDesignBlockQuickAdd } from "./quick-add/design-block-quick-add.js";
import { createDesignAssetResolver } from "./resolvers/design-asset-resolver.js";
import { createCanvasSnapshotBridge } from "./state/canvas-snapshot-bridge.js";
import { createDesignCatalog } from "./state/design-catalog.js";
import { createCanvasModeStore } from "./state/mode-store.js";
import { createPreviewCache } from "./state/preview-cache.js";
import type {
	CanvasPersistenceAdapter,
	CanvasSnapshotAdapter,
} from "./types/types.js";

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
	/**
	 * Host image picker for the canvas editor's `image` tool, surfaced through
	 * the overlay's `<CanvasWorkspace>`. Resolve with an asset id present in the
	 * design (seed library entries via {@link seedAssets}); reject or resolve
	 * `""` to cancel. Omit it to leave the image tool inert.
	 */
	readonly onPickAsset?: () => Promise<string>;
	/**
	 * Host asset-library entries merged into every design the overlay opens, so
	 * ids returned by {@link onPickAsset} resolve to renderable bytes (canvas
	 * commands cannot add assets to a live scene). The design's own assets win
	 * on id collision.
	 */
	readonly seedAssets?: Readonly<Record<string, CanvasAssetRef>>;
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
	const designCatalog = createDesignCatalog();
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
		onPickAsset: options.onPickAsset,
		seedAssets: options.seedAssets,
		onIRChange(designId, pages) {
			designCatalog.set(designId, pages);
		},
		async onCommitAndClose({ designId, puckNodeId, artboardId, ir, stage }) {
			let previewUrl: string | undefined;
			let exportedArtboardId: string | undefined;
			if (stage) {
				const activePageId =
					artboardId && artboardId.length > 0
						? artboardId
						: (ir.pages[0]?.id ?? "");
				const exported = await exportAllArtboards({
					stage,
					activePageId,
					ir,
					designId,
					previewCache,
					// Always seed the design's default bucket too so a bare
					// `design://<designId>` reference (the legacy form) keeps
					// rendering the most recently exported artboard.
					writeDefault: true,
				});
				for (const failure of exported.errors) {
					ctxRef.current?.log?.(
						"warn",
						"Canvas artboard preview rasterization failed.",
						{
							designId,
							artboardId: failure.artboardId,
							error: failure.error.message,
						},
					);
				}
				previewUrl = exported.activePreview.previewUrl;
				exportedArtboardId = exported.activePreview.artboardId;
			}
			// Persist the canonical designId back onto the Puck node (with the
			// preview, when we have one). A DesignBlock inserted with an empty
			// designId gets a fresh random id minted on open; without writing it
			// back, every reopen mints a *different* id and `adapter.load` misses
			// → the editor opens blank and the previous edit is lost. Patching
			// designId here makes the block remember which design it owns, so
			// reopening reloads the saved IR. Runs even when no stage was ready,
			// so the id link survives a commit that produced no export.
			if (puckNodeId) {
				patchDesignBlockPreview({
					ctx: ctxRef.current,
					puckNodeId,
					designId,
					previewUrl,
					artboardId: exportedArtboardId,
					componentType: designBlockComponentType,
				});
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
			let detachOpenCanvas: (() => void) | null = null;
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
						// Bridge the canvas IR's pages → DesignBlock's
						// `artboardId` select. The overlay populates
						// `designCatalog` via `onIRChange`; this lookup is the
						// sync read path consulted by Puck's `resolveFields`.
						setArtboardCatalog((designId) => designCatalog.get(designId) ?? []);
						// Click-to-open bridge: a DesignBlock dispatches
						// CANVAS_OPEN_EVENT from inside a Puck overlay portal
						// (see @anvilkit/design-block). Handling it here opens the
						// editor through the same `modeStore.openEditor` path the
						// header action uses. Guarded for SSR — the event only
						// fires from a client click.
						if (typeof window !== "undefined") {
							const onOpenCanvas = (event: Event) => {
								const detail = (event as CustomEvent<OpenCanvasDetail>).detail;
								if (!detail) return;
								// Empty designId = freshly inserted block; allocate one
								// (mirrors the header action's defaultResolveTarget).
								const designId =
									typeof detail.designId === "string" &&
									detail.designId.length > 0
										? detail.designId
										: typeof crypto !== "undefined" && "randomUUID" in crypto
											? crypto.randomUUID()
											: `design-${Date.now().toString(36)}`;
								modeStore.openEditor({
									designId,
									puckNodeId: detail.puckNodeId ?? null,
									artboardId: detail.artboardId ?? null,
								});
							};
							window.addEventListener(CANVAS_OPEN_EVENT, onOpenCanvas);
							detachOpenCanvas = () =>
								window.removeEventListener(CANVAS_OPEN_EVENT, onOpenCanvas);
						}
					},
					onDestroy() {
						quickAddUnregister?.();
						quickAddUnregister = null;
						detachOpenCanvas?.();
						detachOpenCanvas = null;
						previewCache.clear();
						designCatalog.clear();
						setArtboardCatalog(null);
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
	/** Canonical design id, always written so the block reloads its design. */
	designId: string;
	/** Omitted when no stage was available to export a fresh preview. */
	previewUrl: string | undefined;
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
		// designId is the link the next open uses to reload the saved IR — always write it.
		designId: input.designId,
		...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
		...(input.artboardId !== undefined ? { artboardId: input.artboardId } : {}),
	};
	const dispatch = (api as { dispatch?: (action: unknown) => void }).dispatch;
	dispatch?.({
		type: "replace",
		destinationIndex: index,
		// Puck keys root content under `rootDroppableId` = `${rootAreaId}:${rootZone}`
		// = "root:default-zone" (not the bare "default-zone"). `replaceAction` reads
		// `state.indexes.zones[destinationZone].contentIds` with no guard, so a bare
		// zone id resolves to undefined → "Cannot read properties of undefined
		// (reading 'contentIds')". The constant isn't exported from @puckeditor/core.
		destinationZone: "root:default-zone",
		data: {
			...target,
			props: nextProps,
		},
	});
}
