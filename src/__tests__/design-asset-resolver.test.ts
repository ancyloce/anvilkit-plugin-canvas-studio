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

	it("ignores ?artboard=... query suffix on the design id", async () => {
		const cache = createPreviewCache();
		cache.set("a", "data:image/png;base64,AAAA");
		const resolve = createDesignAssetResolver(cache);
		const result = await resolve("design://a?artboard=main");
		expect(result?.url).toBe("data:image/png;base64,AAAA");
	});

	it("returns null when the design id is empty", async () => {
		const cache = createPreviewCache();
		const resolve = createDesignAssetResolver(cache);
		expect(await resolve("design://")).toBeNull();
	});
});
