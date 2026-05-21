import { describe, expect, it } from "vitest";
import { createDesignCatalog } from "../state/design-catalog.js";

describe("createDesignCatalog", () => {
	it("returns undefined for unknown designs", () => {
		const c = createDesignCatalog();
		expect(c.get("missing")).toBeUndefined();
	});

	it("stores and retrieves entries by designId", () => {
		const c = createDesignCatalog();
		c.set("d1", [{ id: "a", label: "Artboard A" }, { id: "b" }]);
		expect(c.get("d1")).toEqual([
			{ id: "a", label: "Artboard A" },
			{ id: "b" },
		]);
	});

	it("overwrites existing entries on repeated set", () => {
		const c = createDesignCatalog();
		c.set("d1", [{ id: "a" }]);
		c.set("d1", [{ id: "b" }, { id: "c" }]);
		expect(c.get("d1")).toEqual([{ id: "b" }, { id: "c" }]);
	});

	it("keeps multiple designs independent", () => {
		const c = createDesignCatalog();
		c.set("d1", [{ id: "a" }]);
		c.set("d2", [{ id: "x" }]);
		expect(c.get("d1")).toEqual([{ id: "a" }]);
		expect(c.get("d2")).toEqual([{ id: "x" }]);
	});

	it("deleteDesign removes only the targeted design", () => {
		const c = createDesignCatalog();
		c.set("d1", [{ id: "a" }]);
		c.set("d2", [{ id: "x" }]);
		c.deleteDesign("d1");
		expect(c.get("d1")).toBeUndefined();
		expect(c.get("d2")).toEqual([{ id: "x" }]);
	});

	it("is immune to caller mutation of the source array after set", () => {
		const c = createDesignCatalog();
		const source: { id: string; label?: string }[] = [{ id: "a" }];
		c.set("d1", source);
		source.push({ id: "b" });
		source[0] = { id: "z" };
		expect(c.get("d1")).toEqual([{ id: "a" }]);
	});

	it("is immune to caller mutation of individual entry objects after set", () => {
		const c = createDesignCatalog();
		const entry = { id: "a", label: "A" };
		c.set("d1", [entry]);
		entry.id = "z";
		entry.label = "Z";
		expect(c.get("d1")).toEqual([{ id: "a", label: "A" }]);
	});

	it("clear removes every entry", () => {
		const c = createDesignCatalog();
		c.set("d1", [{ id: "a" }]);
		c.set("d2", [{ id: "x" }]);
		c.clear();
		expect(c.get("d1")).toBeUndefined();
		expect(c.get("d2")).toBeUndefined();
	});
});
