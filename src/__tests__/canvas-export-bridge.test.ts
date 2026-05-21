import type Konva from "konva";
import { describe, expect, it, vi } from "vitest";
import { exportCanvasToAsset } from "../export/CanvasExportBridge.js";
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
