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
