export { inMemoryCanvasAdapter } from "./adapters/in-memory.js";
export { inMemoryCanvasSnapshotAdapter } from "./adapters/in-memory-snapshot.js";
export {
	type LocalStorageCanvasAdapterOptions,
	localStorageCanvasAdapter,
} from "./adapters/local-storage.js";
export {
	MODE_SWITCH_ACTION_ID,
	createModeSwitchAction,
	type CreateModeSwitchActionOptions,
} from "./actions/mode-switch-action.js";
export {
	type CanvasExportInput,
	type CanvasExportResult,
	exportCanvasToAsset,
} from "./export/CanvasExportBridge.js";
export {
	createCanvasModeOverlay,
	type CreateCanvasModeOverlayOptions,
} from "./overlays/CanvasModeOverlay.js";
export {
	DESIGN_REFERENCE_PREFIX,
	createDesignAssetResolver,
} from "./resolvers/design-asset-resolver.js";
export {
	type PreviewCache,
	createPreviewCache,
} from "./state/preview-cache.js";
export {
	CANVAS_KEYSPACE,
	type CanvasSnapshotBridge,
	type CanvasVersionHistoryEventPayload,
	type CreateCanvasSnapshotBridgeOptions,
	createCanvasSnapshotBridge,
	OPEN_REQUESTED_EVENT,
	SAVE_REQUESTED_EVENT,
} from "./state/canvas-snapshot-bridge.js";
export {
	createCanvasStudioPlugin,
	type CreateCanvasStudioPluginOptions,
} from "./plugin.js";
export { CANVAS_STUDIO_PLUGIN_META } from "./plugin-meta.js";
export {
	DESIGN_BLOCK_QUICK_ADD_ID,
	createDesignBlockQuickAdd,
	type CreateDesignBlockQuickAddOptions,
} from "./quick-add/design-block-quick-add.js";
export {
	type CanvasModeState,
	type CanvasModeStoreApi,
	createCanvasModeStore,
} from "./state/mode-store.js";
export type {
	CanvasDesignMeta,
	CanvasPersistenceAdapter,
	CanvasSnapshotAdapter,
	CanvasSnapshotMeta,
	MaybePromise,
} from "./types.js";
