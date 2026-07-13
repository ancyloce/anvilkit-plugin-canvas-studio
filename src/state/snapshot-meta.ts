import type { CanvasIR } from "@anvilkit/canvas-core";
import type {
	CanvasSnapshotExportMeta,
	CanvasSnapshotMeta,
} from "../types/types.js";

/**
 * Derive an export-relevant structural summary from a saved IR (FR-073):
 * page count, plus provenance for any page that is a campaign-resize
 * variant of another page (`CanvasPage.variantSource`, FR-061).
 */
export function buildCanvasSnapshotExportMeta(
	ir: CanvasIR,
): CanvasSnapshotExportMeta {
	const variants = ir.pages
		.filter((page) => page.variantSource !== undefined)
		.map((page) => ({
			pageId: page.id,
			presetId: page.variantSource?.presetId ?? "",
			presetVersion: page.variantSource?.presetVersion ?? "",
		}));
	return { pageCount: ir.pages.length, variants };
}

/**
 * Build the enriched {@link CanvasSnapshotMeta} for a freshly saved snapshot
 * (FR-073) — every `CanvasSnapshotAdapter.save` implementation should
 * construct its returned metadata through this so `irVersion`/`assetIds`/
 * `brandKitId`/`exportMeta` are derived consistently regardless of adapter.
 */
export function buildCanvasSnapshotMeta(
	id: string,
	designId: string,
	savedAt: string,
	ir: CanvasIR,
	label?: string,
): CanvasSnapshotMeta {
	return {
		id,
		designId,
		savedAt,
		...(label !== undefined ? { label } : {}),
		irVersion: ir.version,
		assetIds: Object.keys(ir.assets),
		...(ir.metadata.brandId !== undefined
			? { brandKitId: ir.metadata.brandId }
			: {}),
		exportMeta: buildCanvasSnapshotExportMeta(ir),
	};
}
