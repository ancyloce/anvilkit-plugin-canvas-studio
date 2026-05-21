import { describe, expect, it } from "vitest";
import { createDesignAssetResolver } from "../resolvers/design-asset-resolver.js";
import { createPreviewCache } from "../state/preview-cache.js";

describe("createDesignAssetResolver", () => {
	it("returns null for urls outside the design:// scheme", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,AAAA");
		const resolve = createDesignAssetResolver(cache);
		expect(await resolve("asset://other")).toBeNull();
		expect(await resolve("https://example.com/foo.png")).toBeNull();
	});

	it("returns null when the design id has no cached preview", async () => {
		const cache = createPreviewCache();
		const resolve = createDesignAssetResolver(cache);
		expect(await resolve("design://missing")).toBeNull();
	});

	it("returns the cached preview URL when present", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,AAAA");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a");
		expect(result?.url).toBe("data:image/png;base64,AAAA");
	});

	it("falls back to the default bucket when ?artboard=... query has no specific entry", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,AAAA");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a?artboard=main");
		expect(result?.url).toBe("data:image/png;base64,AAAA");
	});

	it("resolves the artboard-specific entry via the path form", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,DEFAULT");
		cache.set("a", "data:image/png;base64,HERO", "hero");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a/hero");
		expect(result?.url).toBe("data:image/png;base64,HERO");
	});

	it("resolves the artboard-specific entry via the legacy query form", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,DEFAULT");
		cache.set("a", "data:image/png;base64,COVER", "cover");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a?artboard=cover");
		expect(result?.url).toBe("data:image/png;base64,COVER");
	});

	it("falls back to the default when the artboard path id is uncached", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,DEFAULT");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a/missing");
		expect(result?.url).toBe("data:image/png;base64,DEFAULT");
	});

	it("returns null when the design id is empty", async () => {
		const cache = createPreviewCache();
		const resolve = createDesignAssetResolver(cache);
		expect(await resolve("design://")).toBeNull();
	});

	it("does not throw when ?artboard=... contains a malformed percent-escape", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,DEFAULT");
		const resolve = createDesignAssetResolver(cache);
		// `design://a?artboard=%` — lone `%` makes decodeURIComponent throw.
		// Resolver should swallow the decode error and fall back to the
		// design's default bucket rather than blowing up the export chain.
		const result = await resolve("design://a?artboard=%");
		expect(result?.url).toBe("data:image/png;base64,DEFAULT");
	});
});
