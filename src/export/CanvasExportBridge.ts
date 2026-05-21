import type Konva from "konva";
import type { PreviewCache } from "../state/preview-cache.js";

export interface CanvasExportInput {
	readonly stage: Konva.Stage;
	readonly designId: string;
	readonly previewCache: PreviewCache;
	/** Defaults to 2 (retina-quality preview). */
	readonly pixelRatio?: number;
	/** Defaults to `"image/png"`. */
	readonly mimeType?: "image/png" | "image/jpeg" | "image/webp";
	/** Only honored for image/jpeg + image/webp. Defaults to 0.92. */
	readonly quality?: number;
}

export interface CanvasExportResult {
	readonly designId: string;
	readonly previewUrl: string;
	readonly mimeType: string;
}

/**
 * Snapshot the current Konva stage to a data URL, write it into the
 * preview cache (so the `design://` resolver can hand it back later),
 * and return the URL so the caller can patch it onto the Puck
 * `DesignBlock` node it came from.
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
	input.previewCache.set(input.designId, previewUrl);
	return {
		designId: input.designId,
		previewUrl,
		mimeType,
	};
}
