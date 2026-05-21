import { getArtboardCatalog, setArtboardCatalog } from "@anvilkit/design-block";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { MODE_SWITCH_ACTION_ID } from "../actions/mode-switch-action.js";
import { createCanvasStudioPlugin } from "../plugin.js";
import { CANVAS_STUDIO_PLUGIN_META } from "../plugin-meta.js";
import { DESIGN_BLOCK_QUICK_ADD_ID } from "../quick-add/design-block-quick-add.js";

describe("createCanvasStudioPlugin", () => {
	it("returns a plugin with the canonical meta", () => {
		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		expect(plugin.meta).toBe(CANVAS_STUDIO_PLUGIN_META);
	});

	it("registers the toggle header action and the viewport overlay", () => {
		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const registration = plugin.register(makeFakeCtx());
		expect(registration.headerActions?.map((a) => a.id)).toEqual([
			MODE_SWITCH_ACTION_ID,
		]);
		expect(registration.overlays).toHaveLength(1);
		expect(registration.overlays?.[0]?.placement).toBe("viewport");
		expect(registration.overlays?.[0]?.id).toBe("canvas-studio:overlay");
	});

	it("registers the design-block layer quick-add on onInit", () => {
		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const ctx = makeFakeCtx();
		const registration = plugin.register(ctx);
		registration.hooks?.onInit?.(ctx);
		expect(ctx.registerLayerQuickAdd).toHaveBeenCalledTimes(1);
		const arg = (ctx.registerLayerQuickAdd as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[0];
		expect(arg?.id).toBe(DESIGN_BLOCK_QUICK_ADD_ID);
	});

	it("unregisters quick-add on onDestroy", () => {
		const unregister = vi.fn();
		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const ctx = makeFakeCtx();
		(ctx.registerLayerQuickAdd as ReturnType<typeof vi.fn>).mockReturnValue(
			unregister,
		);
		const registration = plugin.register(ctx);
		registration.hooks?.onInit?.(ctx);
		registration.hooks?.onDestroy?.(ctx);
		expect(unregister).toHaveBeenCalledTimes(1);
	});

	describe("artboard catalog wiring", () => {
		afterEach(() => {
			// Reset the design-block module singleton so tests don't leak.
			setArtboardCatalog(null);
		});

		it("registers a catalog function with design-block on onInit", () => {
			const plugin = createCanvasStudioPlugin({
				adapter: inMemoryCanvasAdapter(),
			});
			const ctx = makeFakeCtx();
			const registration = plugin.register(ctx);
			expect(getArtboardCatalog()).toBeNull();
			registration.hooks?.onInit?.(ctx);
			expect(typeof getArtboardCatalog()).toBe("function");
		});

		it("registered catalog returns [] for designs the overlay has never loaded", () => {
			const plugin = createCanvasStudioPlugin({
				adapter: inMemoryCanvasAdapter(),
			});
			const ctx = makeFakeCtx();
			const registration = plugin.register(ctx);
			registration.hooks?.onInit?.(ctx);
			const fn = getArtboardCatalog();
			expect(fn?.("untouched")).toEqual([]);
		});

		it("clears the catalog on onDestroy", () => {
			const plugin = createCanvasStudioPlugin({
				adapter: inMemoryCanvasAdapter(),
			});
			const ctx = makeFakeCtx();
			const registration = plugin.register(ctx);
			registration.hooks?.onInit?.(ctx);
			expect(getArtboardCatalog()).not.toBeNull();
			registration.hooks?.onDestroy?.(ctx);
			expect(getArtboardCatalog()).toBeNull();
		});
	});
});

function makeFakeCtx() {
	return {
		registerLayerQuickAdd: vi.fn(() => () => {
			/* no-op cleanup */
		}),
		getPuckApi: () => null,
		emit: vi.fn(),
		log: vi.fn(),
	} as unknown as Parameters<
		ReturnType<typeof createCanvasStudioPlugin>["register"]
	>[0];
}
