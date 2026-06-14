import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewCache } from "../state/preview-cache.js";

const DATA_URL = "data:image/png;base64,AAAA";
const DATA_URL_2 = "data:image/png;base64,BBBB";

let nextId = 0;
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
	nextId = 0;
	created.length = 0;
	revoked.length = 0;
	// Deterministic object-URL minting so we can assert create/revoke pairing
	// regardless of the jsdom build's native createObjectURL behaviour.
	vi.stubGlobal("URL", {
		createObjectURL: vi.fn(() => {
			const url = `blob:mock/${nextId++}`;
			created.push(url);
			return url;
		}),
		revokeObjectURL: vi.fn((url: string) => {
			revoked.push(url);
		}),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("preview store (object-URL backed)", () => {
	it("returns the data URL from get() and an object URL from getObjectUrl()", () => {
		const store = createPreviewCache();
		store.set("d1", DATA_URL, "p1");

		// get() feeds the `design://` export resolver — must stay self-contained.
		expect(store.get("d1", "p1")).toBe(DATA_URL);
		// getObjectUrl() feeds the live DesignBlock — a blob: URL.
		expect(store.getObjectUrl("d1", "p1")).toBe("blob:mock/0");
		expect(created).toEqual(["blob:mock/0"]);
	});

	it("revokes the previous object URL when an entry is replaced", () => {
		const store = createPreviewCache();
		store.set("d1", DATA_URL, "p1");
		store.set("d1", DATA_URL_2, "p1");

		expect(store.get("d1", "p1")).toBe(DATA_URL_2);
		expect(store.getObjectUrl("d1", "p1")).toBe("blob:mock/1");
		// The first object URL must be revoked so the blob is freed.
		expect(revoked).toEqual(["blob:mock/0"]);
	});

	it("revokes on delete, deleteDesign, and clear", () => {
		const store = createPreviewCache();
		store.set("d1", DATA_URL, "p1");
		store.set("d1", DATA_URL_2, "p2");
		store.set("d2", DATA_URL);

		store.delete("d1", "p1");
		expect(revoked).toContain("blob:mock/0");

		store.deleteDesign("d1");
		expect(revoked).toContain("blob:mock/1");

		store.clear();
		expect(revoked).toContain("blob:mock/2");
		expect(store.getObjectUrl("d2")).toBeUndefined();
	});

	it("falls back to the default bucket for an uncached artboard", () => {
		const store = createPreviewCache();
		store.set("d1", DATA_URL); // default bucket only

		expect(store.getObjectUrl("d1", "missing")).toBe("blob:mock/0");
		expect(store.get("d1", "missing")).toBe(DATA_URL);
	});

	it("degrades to the data URL when object URLs are unavailable", () => {
		vi.stubGlobal("URL", {}); // no createObjectURL
		const store = createPreviewCache();
		store.set("d1", DATA_URL, "p1");

		expect(store.getObjectUrl("d1", "p1")).toBe(DATA_URL);
		expect(store.get("d1", "p1")).toBe(DATA_URL);
		// No object URL was minted, so clear() must not attempt a revoke.
		expect(() => store.clear()).not.toThrow();
	});
});
