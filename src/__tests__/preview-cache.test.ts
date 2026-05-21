import { describe, expect, it } from "vitest";
import { createPreviewCache } from "../state/preview-cache.js";

describe("createPreviewCache", () => {
	it("stores and retrieves a design-level (default-bucket) entry", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		expect(cache.get("d1")).toBe("url-default");
	});

	it("stores and retrieves an artboard-specific entry without colliding with the default", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		cache.set("d1", "url-hero", "hero");
		cache.set("d1", "url-cover", "cover");
		expect(cache.get("d1")).toBe("url-default");
		expect(cache.get("d1", "hero")).toBe("url-hero");
		expect(cache.get("d1", "cover")).toBe("url-cover");
	});

	it("falls back to the default when the requested artboard has no entry", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		expect(cache.get("d1", "missing")).toBe("url-default");
	});

	it("falls back to any artboard entry when neither default nor specific exist", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-hero", "hero");
		expect(cache.get("d1")).toBe("url-hero");
	});

	it("returns undefined for unknown design ids", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		expect(cache.get("d2")).toBeUndefined();
	});

	it("deleteDesign removes every entry for that design", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		cache.set("d1", "url-hero", "hero");
		cache.set("d2", "url-d2");
		cache.deleteDesign("d1");
		expect(cache.get("d1")).toBeUndefined();
		expect(cache.get("d1", "hero")).toBeUndefined();
		expect(cache.get("d2")).toBe("url-d2");
	});

	it("delete removes only the requested bucket", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		cache.set("d1", "url-hero", "hero");
		cache.delete("d1", "hero");
		// Default still present; specific entry now falls back to default.
		expect(cache.get("d1", "hero")).toBe("url-default");
	});

	it("clear wipes every design", () => {
		const cache = createPreviewCache();
		cache.set("d1", "url-default");
		cache.set("d2", "url-default");
		cache.clear();
		expect(cache.get("d1")).toBeUndefined();
		expect(cache.get("d2")).toBeUndefined();
	});
});
