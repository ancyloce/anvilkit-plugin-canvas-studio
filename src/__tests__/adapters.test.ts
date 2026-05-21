import { createCanvasIR, createPage } from "@anvilkit/canvas-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { localStorageCanvasAdapter } from "../adapters/local-storage.js";

const FIXED_TS = "2026-05-20T00:00:00.000Z";

function fixtureIR(id: string) {
	return createCanvasIR({
		id,
		title: `design-${id}`,
		pages: [createPage({ id: `${id}-page` })],
		now: () => FIXED_TS,
	});
}

describe("inMemoryCanvasAdapter", () => {
	it("round-trips an IR via save/load", async () => {
		const adapter = inMemoryCanvasAdapter();
		const ir = fixtureIR("a");
		await adapter.save("a", ir);
		const loaded = await adapter.load("a");
		expect(loaded?.id).toBe("a");
		expect(loaded?.pages[0]?.id).toBe("a-page");
	});

	it("returns null for unknown designs", async () => {
		const adapter = inMemoryCanvasAdapter();
		expect(await adapter.load("missing")).toBeNull();
	});

	it("list reports all saved designs with metadata", async () => {
		const adapter = inMemoryCanvasAdapter();
		await adapter.save("a", fixtureIR("a"));
		await adapter.save("b", fixtureIR("b"));
		const designs = await adapter.list();
		expect(designs.map((d) => d.id).sort()).toEqual(["a", "b"]);
	});

	it("delete removes a design and drops it from list()", async () => {
		const adapter = inMemoryCanvasAdapter();
		await adapter.save("a", fixtureIR("a"));
		await adapter.delete?.("a");
		expect(await adapter.load("a")).toBeNull();
		expect(await adapter.list()).toHaveLength(0);
	});

	it("save clones — mutating the stored copy does not affect re-load", async () => {
		const adapter = inMemoryCanvasAdapter();
		const ir = fixtureIR("a");
		await adapter.save("a", ir);
		ir.title = "mutated";
		const loaded = await adapter.load("a");
		expect(loaded?.title).toBe("design-a");
	});
});

describe("localStorageCanvasAdapter", () => {
	beforeEach(() => {
		globalThis.localStorage.clear();
	});
	afterEach(() => {
		globalThis.localStorage.clear();
	});

	it("round-trips an IR via save/load under the namespaced key", async () => {
		const adapter = localStorageCanvasAdapter({ namespace: "test" });
		await adapter.save("a", fixtureIR("a"));
		const loaded = await adapter.load("a");
		expect(loaded?.id).toBe("a");
		// Verify key naming.
		expect(globalThis.localStorage.getItem("test:designs:a")).not.toBeNull();
	});

	it("list returns the index in save-order", async () => {
		const adapter = localStorageCanvasAdapter({ namespace: "test" });
		await adapter.save("a", fixtureIR("a"));
		await adapter.save("b", fixtureIR("b"));
		const designs = await adapter.list();
		expect(designs.map((d) => d.id)).toEqual(["a", "b"]);
	});

	it("re-saving an existing id updates rather than duplicates", async () => {
		const adapter = localStorageCanvasAdapter({ namespace: "test" });
		await adapter.save("a", fixtureIR("a"));
		await adapter.save("a", fixtureIR("a"));
		const designs = await adapter.list();
		expect(designs).toHaveLength(1);
	});

	it("delete removes both record and index entry", async () => {
		const adapter = localStorageCanvasAdapter({ namespace: "test" });
		await adapter.save("a", fixtureIR("a"));
		await adapter.delete?.("a");
		expect(await adapter.load("a")).toBeNull();
		expect(await adapter.list()).toHaveLength(0);
		expect(globalThis.localStorage.getItem("test:designs:a")).toBeNull();
	});
});
