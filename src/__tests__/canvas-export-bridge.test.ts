import type {
	CanvasGroupNode,
	CanvasIR,
	CanvasPage,
} from "@anvilkit/canvas-core";
import type Konva from "konva";
import { describe, expect, it, vi } from "vitest";

const rasterizePageMock = vi.fn(async (input: { page: CanvasPage }) => ({
	url: `data:image/png;base64,RASTER-${input.page.id}`,
	mimeType: "image/png" as const,
}));

vi.mock("@anvilkit/canvas-editor", () => ({
	rasterizePage: (input: { page: CanvasPage }) => rasterizePageMock(input),
}));

import {
	exportAllArtboards,
	exportCanvasToAsset,
} from "../export/CanvasExportBridge.js";
import { createPreviewCache } from "../state/preview-cache.js";

function fakeStage(dataUrl = "data:image/png;base64,FAKE"): Konva.Stage {
	return {
		toDataURL: vi.fn(() => dataUrl),
	} as unknown as Konva.Stage;
}

describe("exportCanvasToAsset", () => {
	it("writes to the default bucket when no artboardId is supplied", () => {
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,DEFAULT");
		const result = exportCanvasToAsset({
			stage,
			designId: "d1",
			previewCache: cache,
		});
		expect(result.previewUrl).toBe("data:image/png;base64,DEFAULT");
		expect(result.artboardId).toBeUndefined();
		expect(cache.get("d1")).toBe("data:image/png;base64,DEFAULT");
	});

	it("writes to the artboard bucket when artboardId is supplied", () => {
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,HERO");
		const result = exportCanvasToAsset({
			stage,
			designId: "d1",
			previewCache: cache,
			artboardId: "hero",
		});
		expect(result.artboardId).toBe("hero");
		expect(cache.get("d1", "hero")).toBe("data:image/png;base64,HERO");
		// Default bucket NOT seeded by default when artboardId is provided.
		// The fallback in PreviewCache.get returns the artboard entry only
		// because there's no default cached yet.
		expect(cache.get("d1")).toBe("data:image/png;base64,HERO");
	});

	it("seeds the default bucket too when writeDefault is true", () => {
		const cache = createPreviewCache();
		// Pre-seed an unrelated artboard so we can prove default writes
		// shadow the artboard fallback.
		cache.set("d1", "data:image/png;base64,OLD", "old");
		const stage = fakeStage("data:image/png;base64,HERO");
		exportCanvasToAsset({
			stage,
			designId: "d1",
			previewCache: cache,
			artboardId: "hero",
			writeDefault: true,
		});
		expect(cache.get("d1", "hero")).toBe("data:image/png;base64,HERO");
		expect(cache.get("d1")).toBe("data:image/png;base64,HERO");
	});

	it("treats empty-string artboardId as undefined (default bucket)", () => {
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,EMPTY");
		const result = exportCanvasToAsset({
			stage,
			designId: "d1",
			previewCache: cache,
			artboardId: "",
		});
		expect(result.artboardId).toBeUndefined();
		expect(cache.get("d1")).toBe("data:image/png;base64,EMPTY");
	});

	it("forwards pixelRatio / mimeType / quality to stage.toDataURL", () => {
		const cache = createPreviewCache();
		const stage = fakeStage();
		exportCanvasToAsset({
			stage,
			designId: "d1",
			previewCache: cache,
			pixelRatio: 3,
			mimeType: "image/jpeg",
			quality: 0.8,
		});
		expect(stage.toDataURL).toHaveBeenCalledWith({
			pixelRatio: 3,
			mimeType: "image/jpeg",
			quality: 0.8,
		});
	});
});

function makePage(id: string): CanvasPage {
	const root: CanvasGroupNode = {
		id: `${id}-root`,
		type: "group",
		transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
		bounds: { width: 800, height: 600 },
		zIndex: 0,
		children: [],
	};
	return {
		id,
		size: { width: 800, height: 600 },
		background: { kind: "solid", value: "#ffffff" },
		root,
	};
}

function makeIR(pageIds: ReadonlyArray<string>): CanvasIR {
	return {
		version: "1",
		id: "d1",
		title: "Test",
		pages: pageIds.map(makePage),
		assets: {},
		metadata: {
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	};
}

describe("exportAllArtboards", () => {
	it("seeds a preview entry per artboard for a 3-page design", async () => {
		rasterizePageMock.mockClear();
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,ACTIVE");
		const ir = makeIR(["p1", "p2", "p3"]);
		const result = await exportAllArtboards({
			stage,
			activePageId: "p1",
			ir,
			designId: "d1",
			previewCache: cache,
		});
		expect(cache.get("d1", "p1")).toBe("data:image/png;base64,ACTIVE");
		expect(cache.get("d1", "p2")).toBe("data:image/png;base64,RASTER-p2");
		expect(cache.get("d1", "p3")).toBe("data:image/png;base64,RASTER-p3");
		// Bare `design://<designId>` falls back to the active artboard.
		expect(cache.get("d1")).toBe("data:image/png;base64,ACTIVE");
		expect(result.activePreview.previewUrl).toBe(
			"data:image/png;base64,ACTIVE",
		);
		expect(result.artboardPreviews.map((p) => p.artboardId).sort()).toEqual([
			"p2",
			"p3",
		]);
		expect(result.errors).toEqual([]);
		// Only non-active pages go through rasterizePage.
		expect(rasterizePageMock).toHaveBeenCalledTimes(2);
		const calledIds = rasterizePageMock.mock.calls
			.map((c) => (c[0] as { page: CanvasPage }).page.id)
			.sort();
		expect(calledIds).toEqual(["p2", "p3"]);
	});

	it("isolates per-page rasterization failures", async () => {
		rasterizePageMock.mockReset();
		rasterizePageMock.mockImplementation(
			async (input: { page: CanvasPage }) => {
				if (input.page.id === "p2") {
					throw new Error("synthetic raster failure");
				}
				return {
					url: `data:image/png;base64,RASTER-${input.page.id}`,
					mimeType: "image/png" as const,
				};
			},
		);
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,ACTIVE");
		const ir = makeIR(["p1", "p2", "p3"]);
		const result = await exportAllArtboards({
			stage,
			activePageId: "p1",
			ir,
			designId: "d1",
			previewCache: cache,
		});
		expect(cache.get("d1", "p1")).toBe("data:image/png;base64,ACTIVE");
		expect(cache.get("d1", "p3")).toBe("data:image/png;base64,RASTER-p3");
		// p2 failed → no cache entry (falls back to active via PreviewCache's fallback).
		expect(result.errors).toHaveLength(1);
		const failure = result.errors[0];
		expect(failure?.artboardId).toBe("p2");
		expect(failure?.error.message).toContain("synthetic raster failure");
		expect(result.artboardPreviews.map((p) => p.artboardId).sort()).toEqual([
			"p3",
		]);
	});

	it("only rasterizes once when the design has a single page", async () => {
		rasterizePageMock.mockReset();
		rasterizePageMock.mockImplementation(
			async (input: { page: CanvasPage }) => ({
				url: `data:image/png;base64,RASTER-${input.page.id}`,
				mimeType: "image/png" as const,
			}),
		);
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/png;base64,SOLO");
		const ir = makeIR(["only"]);
		const result = await exportAllArtboards({
			stage,
			activePageId: "only",
			ir,
			designId: "d1",
			previewCache: cache,
		});
		expect(rasterizePageMock).not.toHaveBeenCalled();
		expect(result.artboardPreviews).toEqual([]);
		expect(cache.get("d1", "only")).toBe("data:image/png;base64,SOLO");
		expect(cache.get("d1")).toBe("data:image/png;base64,SOLO");
	});

	it("propagates pixelRatio / mimeType / quality to both the live stage and rasterizePage", async () => {
		rasterizePageMock.mockReset();
		rasterizePageMock.mockImplementation(
			async (input: { page: CanvasPage }) => ({
				url: `data:image/jpeg;base64,RASTER-${input.page.id}`,
				mimeType: "image/jpeg" as const,
			}),
		);
		const cache = createPreviewCache();
		const stage = fakeStage("data:image/jpeg;base64,ACTIVE");
		const ir = makeIR(["p1", "p2"]);
		await exportAllArtboards({
			stage,
			activePageId: "p1",
			ir,
			designId: "d1",
			previewCache: cache,
			pixelRatio: 4,
			mimeType: "image/jpeg",
			quality: 0.7,
		});
		expect(stage.toDataURL).toHaveBeenCalledWith({
			pixelRatio: 4,
			mimeType: "image/jpeg",
			quality: 0.7,
		});
		const rasterArgs = rasterizePageMock.mock.calls[0]?.[0] as {
			pixelRatio?: number;
			mimeType?: string;
			quality?: number;
		};
		expect(rasterArgs.pixelRatio).toBe(4);
		expect(rasterArgs.mimeType).toBe("image/jpeg");
		expect(rasterArgs.quality).toBe(0.7);
	});

	it("does NOT seed the default bucket when writeDefault is false", async () => {
		rasterizePageMock.mockReset();
		rasterizePageMock.mockImplementation(
			async (input: { page: CanvasPage }) => ({
				url: `data:image/png;base64,RASTER-${input.page.id}`,
				mimeType: "image/png" as const,
			}),
		);
		const cache = createPreviewCache();
		// Pre-seed the default bucket with something legacy so we can detect
		// whether writeDefault=false leaves it alone.
		cache.set("d1", "data:image/png;base64,LEGACY");
		const stage = fakeStage("data:image/png;base64,ACTIVE");
		const ir = makeIR(["p1", "p2"]);
		await exportAllArtboards({
			stage,
			activePageId: "p1",
			ir,
			designId: "d1",
			previewCache: cache,
			writeDefault: false,
		});
		expect(cache.get("d1")).toBe("data:image/png;base64,LEGACY");
		expect(cache.get("d1", "p1")).toBe("data:image/png;base64,ACTIVE");
	});
});
