import { createCanvasIR, createPage } from "@anvilkit/canvas-core";
import { describe, expect, it } from "vitest";
import {
	buildCanvasSnapshotExportMeta,
	buildCanvasSnapshotMeta,
} from "../state/snapshot-meta.js";

describe("buildCanvasSnapshotMeta", () => {
	it("derives irVersion, assetIds, and an empty exportMeta for a blank document", () => {
		const ir = createCanvasIR({
			id: "d1",
			title: "d1",
			pages: [createPage({ id: "p1" })],
		});
		const meta = buildCanvasSnapshotMeta(
			"snap1",
			"d1",
			"2026-07-13T00:00:00.000Z",
			ir,
		);
		expect(meta).toEqual({
			id: "snap1",
			designId: "d1",
			savedAt: "2026-07-13T00:00:00.000Z",
			irVersion: "2",
			assetIds: [],
			exportMeta: { pageCount: 1, variants: [] },
		});
	});

	it("carries a label, asset ids, and the brand kit reference when present", () => {
		let ir = createCanvasIR({
			id: "d1",
			title: "d1",
			pages: [createPage({ id: "p1" })],
		});
		ir = {
			...ir,
			assets: { a1: { id: "a1", uri: "asset://a1" } },
			metadata: { ...ir.metadata, brandId: "brand-1" },
		};
		const meta = buildCanvasSnapshotMeta(
			"snap1",
			"d1",
			"2026-07-13T00:00:00.000Z",
			ir,
			"before-ai",
		);
		expect(meta.label).toBe("before-ai");
		expect(meta.assetIds).toEqual(["a1"]);
		expect(meta.brandKitId).toBe("brand-1");
	});

	it("omits brandKitId when the document has no brand kit reference", () => {
		const ir = createCanvasIR({
			id: "d1",
			title: "d1",
			pages: [createPage({ id: "p1" })],
		});
		const meta = buildCanvasSnapshotMeta(
			"snap1",
			"d1",
			"2026-07-13T00:00:00.000Z",
			ir,
		);
		expect("brandKitId" in meta).toBe(false);
	});
});

describe("buildCanvasSnapshotExportMeta", () => {
	it("reports pageCount and no variants for pages without variantSource", () => {
		const ir = createCanvasIR({
			id: "d1",
			title: "d1",
			pages: [createPage({ id: "p1" }), createPage({ id: "p2" })],
		});
		expect(buildCanvasSnapshotExportMeta(ir)).toEqual({
			pageCount: 2,
			variants: [],
		});
	});

	it("surfaces campaign-resize variant provenance for pages that carry it", () => {
		const sourcePage = createPage({ id: "p1" });
		const variantPage = {
			...createPage({ id: "p2" }),
			variantSource: {
				sourcePageId: "p1",
				presetId: "instagram-post",
				presetVersion: "1",
			},
		};
		const ir = createCanvasIR({
			id: "d1",
			title: "d1",
			pages: [sourcePage, variantPage],
		});
		expect(buildCanvasSnapshotExportMeta(ir)).toEqual({
			pageCount: 2,
			variants: [
				{ pageId: "p2", presetId: "instagram-post", presetVersion: "1" },
			],
		});
	});
});
