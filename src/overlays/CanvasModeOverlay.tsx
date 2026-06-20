"use client";

import {
	type CanvasAssetRef,
	type CanvasIR,
	type CanvasPage,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import { CanvasWorkspace } from "@anvilkit/canvas-editor";
// The canvas-editor is localized via a prop-injected `messages` catalog (it
// can't depend on `@anvilkit/core`). We bridge core's active locale to the
// matching bundled catalog so the overlay speaks the same language as the rest
// of Studio — and tracks `setLocale` because `useOptionalLocale` reads the live
// store, not the seed config value.
import canvasMessagesEn from "@anvilkit/canvas-editor/i18n/en.json";
import canvasMessagesZh from "@anvilkit/canvas-editor/i18n/zh.json";
// Import from the `/config` subpath (not the main barrel) so the plugin
// doesn't pull in core's dnd-kit-laden sidebar graph — keeps the bundle lean
// and the jsdom test env free of ResizeObserver requirements.
import { useStudioConfig } from "@anvilkit/core/config";
import { useMsg, useOptionalLocale } from "@anvilkit/core/i18n";
import type Konva from "konva";
import React, {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { studioConfigToBrandKit } from "../brand/studio-config-to-brand-kit.js";
import type { CanvasModeStoreApi } from "../state/mode-store.js";
import type { CanvasPersistenceAdapter } from "../types/types.js";

/**
 * Pure projection from a `CanvasIR.pages` array to the catalog-entry
 * shape consumed by `@anvilkit/design-block`'s `resolveFields`. Exported
 * for direct unit testing — the overlay calls this inline.
 */
export function pagesToCatalogEntries(
	pages: ReadonlyArray<CanvasPage>,
): ReadonlyArray<{ id: string; label?: string }> {
	return pages.map((p) =>
		p.name && p.name.length > 0 ? { id: p.id, label: p.name } : { id: p.id },
	);
}

export interface CreateCanvasModeOverlayOptions {
	readonly modeStore: CanvasModeStoreApi;
	readonly adapter: CanvasPersistenceAdapter;
	/**
	 * Optional callback fired when the user clicks "Back to Page". The
	 * factory `createCanvasStudioPlugin` injects a real implementation
	 * (T6: `CanvasExportBridge` — exports the stage, saves the IR, and
	 * patches the Puck DesignBlock). When omitted, "Back to Page" only
	 * closes the overlay.
	 *
	 * Receives the live Konva stage so the bridge can call
	 * `stage.toDataURL()` without re-mounting the editor.
	 */
	readonly onCommitAndClose?: (input: {
		designId: string;
		puckNodeId: string | null;
		artboardId: string | null;
		ir: CanvasIR;
		stage: Konva.Stage | null;
	}) => Promise<void> | void;
	/**
	 * Optional callback fired whenever the overlay learns about the IR's
	 * page list — once after the initial IR load, and again on every
	 * `<CanvasStudio>` `onChange`. The plugin uses this to keep a
	 * synchronous `designId → artboards[]` mirror up to date so the
	 * Puck DesignBlock inspector's `artboardId` field can render as a
	 * populated select.
	 */
	readonly onIRChange?: (
		designId: string,
		pages: ReadonlyArray<{ id: string; label?: string }>,
	) => void;
	/**
	 * Host image picker for the editor's `image` tool. The tool calls this to
	 * resolve the asset id to place; resolve with an id present in the design's
	 * `assets` (see {@link seedAssets}), or reject / resolve `""` to cancel.
	 * Omit it to leave the image tool inert (it throws if used).
	 */
	readonly onPickAsset?: () => Promise<string>;
	/**
	 * Host asset-library entries merged into every opened design's `assets`
	 * (the design's own entries win on id collision). Canvas commands cannot
	 * add an asset to a live scene, so a placed image only renders if its
	 * asset is present at mount — this is how a host makes its library
	 * placeable through {@link onPickAsset} in the overlay.
	 */
	readonly seedAssets?: Readonly<Record<string, CanvasAssetRef>>;
}

export function createCanvasModeOverlay({
	modeStore,
	adapter,
	onCommitAndClose,
	onIRChange,
	onPickAsset,
	seedAssets,
}: CreateCanvasModeOverlayOptions): () => React.JSX.Element | null {
	function CanvasModeOverlay() {
		const state = useSyncExternalStore(
			modeStore.subscribe,
			modeStore.getState,
			modeStore.getState,
		);
		// Shared brand colors + fonts from the host's Studio config (I3-4).
		// `studioConfigToBrandKit` is a stable module-level selector, so the
		// derived kit is memoized by config identity and passed straight to
		// the canvas editor's `brandKit` prop.
		const brandKit = useStudioConfig(studioConfigToBrandKit);
		// Pick the canvas-editor catalog for the active locale. `startsWith`
		// tolerates region tags (`zh`, `zh-CN`, `zh-Hans`); anything else falls
		// back to English (the editor's own inline fallbacks cover any gaps).
		const locale = useOptionalLocale();
		const canvasMessages = locale.startsWith("zh")
			? canvasMessagesZh
			: canvasMessagesEn;
		const [initialIR, setInitialIR] = useState<CanvasIR | null>(null);
		// `currentIR` and `busy` are read only inside `handleBack` (the
		// commit-and-close handler), never in render, so they live in refs.
		// `currentIR` updates on every editor `onChange` — drag gestures fire
		// many — so keeping it out of state avoids a wasted overlay re-render
		// per edit. The `busy` ref also makes the double-commit guard
		// synchronous (a state guard can miss a fast second click before the
		// re-render propagates the updated closure to the Back button).
		const currentIRRef = useRef<CanvasIR | null>(null);
		const busyRef = useRef(false);
		const stageRef = useRef<Konva.Stage | null>(null);
		// CanvasStudio's first `onActivePageChange` fires synchronously
		// after mount with the resolved active page id (validated initial,
		// or `pages[0].id`), so we don't need to seed this ref from
		// `state.artboardId` — that would carry a stale value if the
		// stored artboardId no longer exists in `initialIR.pages`.
		const activePageIdRef = useRef<string | null>(null);

		// Load the design IR from the adapter whenever the overlay opens
		// with a designId. If the adapter has no record yet, mint a fresh
		// blank IR.
		useEffect(() => {
			if (!state.open) {
				setInitialIR(null);
				currentIRRef.current = null;
				return;
			}
			let cancelled = false;
			(async () => {
				const stored = await Promise.resolve(adapter.load(state.designId));
				if (cancelled) return;
				const loaded =
					stored ??
					createCanvasIR({
						id: state.designId,
						title: state.designId,
						pages: [createPage({ id: `${state.designId}-page` })],
					});
				// Make host asset-library entries placeable (the design's own
				// assets win on id collision so we never clobber stored bytes).
				const ir = seedAssets
					? { ...loaded, assets: { ...seedAssets, ...loaded.assets } }
					: loaded;
				setInitialIR(ir);
				currentIRRef.current = ir;
				onIRChange?.(state.designId, pagesToCatalogEntries(ir.pages));
			})();
			return () => {
				cancelled = true;
			};
		}, [state.open, state.designId]);

		// Full-viewport host for the editor shell. `<CanvasWorkspace>`'s root is
		// `h-full` and brings its own themed `bg-background`, so the overlay only
		// owns the fixed positioning + stacking context.
		const overlayStyle = useMemo(
			() => ({ position: "fixed", inset: 0, zIndex: 100 }) as const,
			[],
		);
		const msg = useMsg();

		if (!state.open) return null;
		if (!initialIR) {
			return (
				<div
					style={{
						...overlayStyle,
						display: "grid",
						placeItems: "center",
						background: "var(--background, #ffffff)",
						color: "var(--foreground, #0f172a)",
					}}
					data-testid="canvas-mode-overlay-loading"
				>
					{msg("canvas-studio.overlay.loadingDesign")}
				</div>
			);
		}

		const handleBack = async () => {
			if (busyRef.current) return;
			busyRef.current = true;
			try {
				const ir = currentIRRef.current;
				if (ir) {
					await Promise.resolve(adapter.save(state.designId, ir));
					await onCommitAndClose?.({
						designId: state.designId,
						puckNodeId: state.puckNodeId,
						artboardId: activePageIdRef.current,
						ir,
						stage: stageRef.current,
					});
				}
				modeStore.closeEditor();
			} finally {
				busyRef.current = false;
			}
		};

		return (
			<div
				style={overlayStyle}
				data-testid="canvas-mode-overlay"
				data-design-id={state.designId}
			>
				<CanvasWorkspace
					initialIR={initialIR}
					brandKit={brandKit}
					// Locale-bridged i18n catalog (see the import-site note). The
					// editor resolves `t(key, fallback)` against this map.
					messages={canvasMessages}
					// Stable per-design id so the workspace UI store (active panel
					// tab, inspector collapse) is isolated per design and survives
					// re-renders rather than resetting on every overlay re-render.
					storeId={state.designId}
					// "Back" lives in the workspace header now. It still runs the
					// full commit-and-close bridge (save IR, export preview, patch
					// the Puck DesignBlock) via `handleBack`. The `busy` guard keeps
					// a double-click from committing twice.
					onBack={handleBack}
					// Host image picker for the `image` tool (undefined → tool inert).
					onPickAsset={onPickAsset}
					{...(state.artboardId &&
					initialIR.pages.some((p) => p.id === state.artboardId)
						? { initialActivePageId: state.artboardId }
						: {})}
					onChange={(ir) => {
						currentIRRef.current = ir;
						onIRChange?.(state.designId, pagesToCatalogEntries(ir.pages));
					}}
					onActivePageChange={(pageId) => {
						activePageIdRef.current = pageId;
					}}
					onStageReady={(stage) => {
						stageRef.current = stage;
					}}
				/>
			</div>
		);
	}
	return CanvasModeOverlay;
}
