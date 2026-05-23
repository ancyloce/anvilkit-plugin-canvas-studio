"use client";

import {
	type CanvasIR,
	type CanvasPage,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import { CanvasStudio } from "@anvilkit/canvas-editor";
// Import from the `/config` subpath (not the main barrel) so the plugin
// doesn't pull in core's dnd-kit-laden sidebar graph — keeps the bundle lean
// and the jsdom test env free of ResizeObserver requirements.
import { useStudioConfig } from "@anvilkit/core/config";
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
}

export function createCanvasModeOverlay({
	modeStore,
	adapter,
	onCommitAndClose,
	onIRChange,
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
		const [initialIR, setInitialIR] = useState<CanvasIR | null>(null);
		const [currentIR, setCurrentIR] = useState<CanvasIR | null>(null);
		const [busy, setBusy] = useState(false);
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
				setCurrentIR(null);
				return;
			}
			let cancelled = false;
			(async () => {
				const stored = await Promise.resolve(adapter.load(state.designId));
				if (cancelled) return;
				const ir =
					stored ??
					createCanvasIR({
						id: state.designId,
						title: state.designId,
						pages: [createPage({ id: `${state.designId}-page` })],
					});
				setInitialIR(ir);
				setCurrentIR(ir);
				onIRChange?.(state.designId, pagesToCatalogEntries(ir.pages));
			})();
			return () => {
				cancelled = true;
			};
		}, [state.open, state.designId]);

		const overlayStyle = useMemo(
			() =>
				({
					position: "fixed",
					inset: 0,
					zIndex: 100,
					background: "#0f172a",
					color: "#e2e8f0",
					display: "flex",
					flexDirection: "column",
				}) as const,
			[],
		);
		const headerStyle = useMemo(
			() =>
				({
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "10px 16px",
					borderBottom: "1px solid #1f2937",
					background: "#020617",
				}) as const,
			[],
		);
		const buttonStyle = useMemo(
			() =>
				({
					padding: "6px 14px",
					background: "#1d4ed8",
					color: "#ffffff",
					border: "none",
					borderRadius: 4,
					cursor: "pointer",
					font: "inherit",
				}) as const,
			[],
		);

		if (!state.open) return null;
		if (!initialIR) {
			return (
				<div style={overlayStyle} data-testid="canvas-mode-overlay-loading">
					Loading design…
				</div>
			);
		}

		const handleBack = async () => {
			if (busy) return;
			setBusy(true);
			try {
				if (currentIR) {
					await Promise.resolve(adapter.save(state.designId, currentIR));
					await onCommitAndClose?.({
						designId: state.designId,
						puckNodeId: state.puckNodeId,
						artboardId: activePageIdRef.current,
						ir: currentIR,
						stage: stageRef.current,
					});
				}
				modeStore.closeEditor();
			} finally {
				setBusy(false);
			}
		};

		return (
			<div
				style={overlayStyle}
				data-testid="canvas-mode-overlay"
				data-design-id={state.designId}
			>
				<header style={headerStyle}>
					<strong>Canvas Studio</strong>
					<span style={{ opacity: 0.7, fontSize: 12 }}>
						design <code>{state.designId}</code>
					</span>
					<div style={{ marginLeft: "auto" }}>
						<button
							type="button"
							style={buttonStyle}
							data-testid="canvas-mode-overlay-back"
							disabled={busy}
							onClick={handleBack}
						>
							{busy ? "Saving…" : "Back to Page"}
						</button>
					</div>
				</header>
				<div style={{ flex: 1, overflow: "auto", background: "#ffffff" }}>
					<CanvasStudio
						initialIR={initialIR}
						brandKit={brandKit}
						{...(state.artboardId &&
						initialIR.pages.some((p) => p.id === state.artboardId)
							? { initialActivePageId: state.artboardId }
							: {})}
						onChange={(ir) => {
							setCurrentIR(ir);
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
			</div>
		);
	}
	return CanvasModeOverlay;
}
