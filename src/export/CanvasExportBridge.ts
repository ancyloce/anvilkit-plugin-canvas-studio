import type { CanvasIR } from "@anvilkit/canvas-core";
import { rasterizePage } from "@anvilkit/canvas-editor";
import type Konva from "konva";
import type { PreviewCache } from "../state/preview-cache.js";

export interface CanvasExportInput {
	readonly stage: Konva.Stage;
	readonly designId: string;
	readonly previewCache: PreviewCache;
	/**
	 * Optional artboard (page) id to associate this preview with. When
	 * provided, the cache entry lives under the artboard key so the
	 * `design://<designId>/<artboardId>` URL form can resolve it. When
	 * omitted, the entry is written to the design's default bucket and
	 * used as the fallback for bare `design://<designId>` URLs.
	 */
	readonly artboardId?: string;
	/**
	 * If true, also write the exported URL to the design's default
	 * bucket so bare `design://<designId>` URLs (e.g. legacy
	 * single-preview DesignBlock entries) still render. Defaults to
	 * `false` when `artboardId` is provided, `true` when it isn't.
	 */
	readonly writeDefault?: boolean;
	/** Defaults to 2 (retina-quality preview). */
	readonly pixelRatio?: number;
	/** Defaults to `"image/png"`. */
	readonly mimeType?: "image/png" | "image/jpeg" | "image/webp";
	/** Only honored for image/jpeg + image/webp. Defaults to 0.92. */
	readonly quality?: number;
}

export interface CanvasExportResult {
	readonly designId: string;
	readonly artboardId: string | undefined;
	readonly previewUrl: string;
	readonly mimeType: string;
}

/**
 * Snapshot the current Konva stage to a data URL, write it into the
 * preview cache (so the `design://` resolver can hand it back later),
 * and return the URL so the caller can patch it onto the Puck
 * `DesignBlock` node it came from.
 *
 * When `artboardId` is provided the entry is keyed by
 * `(designId, artboardId)`. Pass `writeDefault: true` to also seed the
 * design's default bucket so bare `design://<designId>` references
 * still resolve (this is the default when no `artboardId` is supplied).
 */
export function exportCanvasToAsset(
	input: CanvasExportInput,
): CanvasExportResult {
	const pixelRatio = input.pixelRatio ?? 2;
	const mimeType = input.mimeType ?? "image/png";
	const quality = input.quality ?? 0.92;
	const previewUrl = input.stage.toDataURL({
		pixelRatio,
		mimeType,
		quality,
	});
	const artboardId =
		input.artboardId && input.artboardId.length > 0
			? input.artboardId
			: undefined;
	const writeDefault = input.writeDefault ?? artboardId === undefined;
	if (artboardId !== undefined) {
		input.previewCache.set(input.designId, previewUrl, artboardId);
	}
	if (writeDefault) {
		input.previewCache.set(input.designId, previewUrl);
	}
	return {
		designId: input.designId,
		artboardId,
		previewUrl,
		mimeType,
	};
}

export interface ExportAllArtboardsInput {
	/** Live `Konva.Stage` for the currently-active artboard. */
	readonly stage: Konva.Stage;
	/** Id of the page that `stage` is rendering. */
	readonly activePageId: string;
	/** Walks `ir.pages` to enumerate every artboard that needs a preview. */
	readonly ir: CanvasIR;
	readonly designId: string;
	readonly previewCache: PreviewCache;
	/**
	 * If true (the default), the active artboard's preview is also written
	 * to the design's default bucket so bare `design://<designId>` URLs
	 * (the legacy single-preview form) still render.
	 */
	readonly writeDefault?: boolean;
	/** Defaults to 2. */
	readonly pixelRatio?: number;
	/** Defaults to `"image/png"`. */
	readonly mimeType?: "image/png" | "image/jpeg" | "image/webp";
	/** Only honored for image/jpeg + image/webp. Defaults to 0.92. */
	readonly quality?: number;
}

export interface ArtboardPreviewSuccess {
	readonly artboardId: string;
	readonly previewUrl: string;
	readonly mimeType: string;
}

export interface ArtboardPreviewFailure {
	readonly artboardId: string;
	readonly error: Error;
}

export interface ExportAllArtboardsResult {
	readonly designId: string;
	/** Result of exporting the active artboard via the live stage. */
	readonly activePreview: CanvasExportResult;
	/** Non-active artboards that were rasterized successfully. */
	readonly artboardPreviews: ReadonlyArray<ArtboardPreviewSuccess>;
	/** Non-active artboards that threw during rasterization. */
	readonly errors: ReadonlyArray<ArtboardPreviewFailure>;
}

const NON_ACTIVE_CONCURRENCY = 4;

/**
 * Export a preview for every artboard in `ir.pages` and seed the
 * `previewCache` per artboard.
 *
 * The active artboard reuses the live `stage.toDataURL` path
 * (synchronous, accurate, and pixel-identical to what the user sees).
 * Non-active artboards are rendered through `rasterizePage` from
 * `@anvilkit/canvas-editor`, which mounts each page off-screen in a
 * detached `Konva.Stage` and serializes it. Non-active rasterizations
 * run with a bounded concurrency so a 20-page deck does not spawn 20
 * stages at once.
 *
 * Per-page rasterization errors are isolated: one failure does not
 * abort the others and the live-stage export always runs first. The
 * caller can inspect `errors[]` to log or retry individual artboards.
 */
export async function exportAllArtboards(
	input: ExportAllArtboardsInput,
): Promise<ExportAllArtboardsResult> {
	const pixelRatio = input.pixelRatio ?? 2;
	const mimeType = input.mimeType ?? "image/png";
	const quality = input.quality ?? 0.92;
	const writeDefault = input.writeDefault ?? true;

	const activePreview = exportCanvasToAsset({
		stage: input.stage,
		designId: input.designId,
		previewCache: input.previewCache,
		artboardId: input.activePageId,
		writeDefault,
		pixelRatio,
		mimeType,
		quality,
	});

	const nonActivePages = input.ir.pages.filter(
		(p) => p.id !== input.activePageId,
	);
	const artboardPreviews: ArtboardPreviewSuccess[] = [];
	const errors: ArtboardPreviewFailure[] = [];

	await runWithConcurrency(
		nonActivePages,
		NON_ACTIVE_CONCURRENCY,
		async (page) => {
			try {
				const result = await rasterizePage({
					page,
					assets: input.ir.assets,
					pixelRatio,
					mimeType,
					quality,
				});
				input.previewCache.set(input.designId, result.url, page.id);
				artboardPreviews.push({
					artboardId: page.id,
					previewUrl: result.url,
					mimeType: result.mimeType,
				});
			} catch (err) {
				errors.push({
					artboardId: page.id,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		},
	);

	return {
		designId: input.designId,
		activePreview,
		artboardPreviews,
		errors,
	};
}

async function runWithConcurrency<T>(
	items: ReadonlyArray<T>,
	limit: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	if (items.length === 0) return;
	let cursor = 0;
	const workerCount = Math.min(limit, items.length);
	const runners: Promise<void>[] = [];
	for (let i = 0; i < workerCount; i++) {
		runners.push(
			(async () => {
				while (true) {
					const idx = cursor++;
					if (idx >= items.length) return;
					const item = items[idx];
					if (item === undefined) continue;
					await worker(item);
				}
			})(),
		);
	}
	await Promise.all(runners);
}
