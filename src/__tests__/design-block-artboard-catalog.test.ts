/**
 * Unit tests for the `@anvilkit/design-block` artboard-catalog registry
 * and `resolveFields` callback. The design-block package itself ships
 * without a vitest setup (matches the components-submodule convention of
 * `lint + typecheck + build` only). These tests live here so the surface
 * the canvas plugin wires (T3) is regression-covered without introducing
 * new tooling into the submodule.
 */
import {
	componentConfig,
	getArtboardCatalog,
	listArtboards,
	setArtboardCatalog,
} from "@anvilkit/design-block";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	setArtboardCatalog(null);
});

describe("design-block artboard catalog registry", () => {
	it("returns [] when no catalog is registered", () => {
		expect(getArtboardCatalog()).toBeNull();
		expect(listArtboards("d1")).toEqual([]);
	});

	it("returns [] when designId is empty even if a catalog is registered", () => {
		setArtboardCatalog(() => [{ id: "a" }]);
		expect(listArtboards("")).toEqual([]);
	});

	it("returns the catalog function's result on the happy path", () => {
		const catalog = vi.fn(() => [{ id: "p1", label: "Cover" }, { id: "p2" }]);
		setArtboardCatalog(catalog);
		expect(listArtboards("d1")).toEqual([
			{ id: "p1", label: "Cover" },
			{ id: "p2" },
		]);
		expect(catalog).toHaveBeenCalledWith("d1");
	});

	it("returns [] when the catalog throws", () => {
		setArtboardCatalog(() => {
			throw new Error("boom");
		});
		expect(listArtboards("d1")).toEqual([]);
	});

	it("returns [] when the catalog returns a non-array", () => {
		// Cast through unknown — the defensive path catches host bugs that
		// the type system can't prevent at runtime.
		setArtboardCatalog(
			(() => null) as unknown as Parameters<typeof setArtboardCatalog>[0],
		);
		expect(listArtboards("d1")).toEqual([]);
	});

	it("setArtboardCatalog(null) clears prior registration", () => {
		setArtboardCatalog(() => [{ id: "p1" }]);
		expect(listArtboards("d1")).toEqual([{ id: "p1" }]);
		setArtboardCatalog(null);
		expect(getArtboardCatalog()).toBeNull();
		expect(listArtboards("d1")).toEqual([]);
	});
});

describe("design-block resolveFields", () => {
	// `resolveFields` is documented but not exported by name from the
	// design-block package; it lives on `componentConfig.resolveFields`.
	const resolveFields = componentConfig.resolveFields;

	it("is defined on componentConfig", () => {
		expect(typeof resolveFields).toBe("function");
	});

	it("returns the text-field shape when no catalog is registered", async () => {
		const result = await Promise.resolve(
			resolveFields?.(
				{ type: "DesignBlock", props: { id: "n", designId: "d1" } },
				// Puck passes more args at runtime but the callback only
				// reads `data.props`; the cast is enough for the unit test.
				// biome-ignore lint/suspicious/noExplicitAny: test stub
				{} as any,
			),
		);
		const field = result?.artboardId;
		expect(field?.type).toBe("text");
	});

	it("returns the text-field shape when the catalog yields []", async () => {
		setArtboardCatalog(() => []);
		const result = await Promise.resolve(
			resolveFields?.(
				{ type: "DesignBlock", props: { id: "n", designId: "d1" } },
				// biome-ignore lint/suspicious/noExplicitAny: test stub
				{} as any,
			),
		);
		expect(result?.artboardId?.type).toBe("text");
	});

	it("returns a select field with mapped options when catalog has entries", async () => {
		setArtboardCatalog(() => [{ id: "p1", label: "Cover" }, { id: "p2" }]);
		const result = await Promise.resolve(
			resolveFields?.(
				{ type: "DesignBlock", props: { id: "n", designId: "d1" } },
				// biome-ignore lint/suspicious/noExplicitAny: test stub
				{} as any,
			),
		);
		const field = result?.artboardId;
		expect(field?.type).toBe("select");
		if (field?.type === "select") {
			expect(field.label).toBe("Artboard");
			expect(field.options).toEqual([
				{ label: "Cover", value: "p1" },
				// Falls back to id when label is missing.
				{ label: "p2", value: "p2" },
			]);
		}
	});

	it("preserves every other field unchanged when swapping artboardId to select", async () => {
		setArtboardCatalog(() => [{ id: "p1" }]);
		const result = await Promise.resolve(
			resolveFields?.(
				{ type: "DesignBlock", props: { id: "n", designId: "d1" } },
				// biome-ignore lint/suspicious/noExplicitAny: test stub
				{} as any,
			),
		);
		expect(result?.designId?.type).toBe("text");
		expect(result?.previewUrl?.type).toBe("text");
		expect(result?.previewAssetId?.type).toBe("text");
		expect(result?.alt?.type).toBe("text");
		expect(result?.aspectRatio?.type).toBe("radio");
	});
});
