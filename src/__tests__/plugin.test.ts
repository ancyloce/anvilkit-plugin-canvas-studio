import type {
	CanvasGroupNode,
	CanvasIR,
	CanvasPage,
} from "@anvilkit/canvas-core";
import { getArtboardCatalog, setArtboardCatalog } from "@anvilkit/design-block";
import type Konva from "konva";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODE_SWITCH_ACTION_ID } from "../actions/mode-switch-action.js";
import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { CANVAS_STUDIO_PLUGIN_META } from "../meta.js";
import { createCanvasStudioPlugin } from "../plugin.js";
import { DESIGN_BLOCK_QUICK_ADD_ID } from "../quick-add/design-block-quick-add.js";

vi.mock("@anvilkit/canvas-editor", () => ({
	rasterizePage: vi.fn(async (input: { page: CanvasPage }) => ({
		url: `data:image/png;base64,RASTER-${input.page.id}`,
		mimeType: "image/png" as const,
	})),
}));

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

		it("commits every artboard's preview when onCommitAndClose fires with a multi-page IR", async () => {
			const overlayModule = await import("../overlays/CanvasModeOverlay.js");
			let capturedOptions:
				| Parameters<typeof overlayModule.createCanvasModeOverlay>[0]
				| null = null;
			const spy = vi
				.spyOn(overlayModule, "createCanvasModeOverlay")
				.mockImplementation((opts) => {
					capturedOptions = opts;
					return () => null;
				});
			const resolverModule = await import(
				"../resolvers/design-asset-resolver.js"
			);
			let capturedCache:
				| import("../state/preview-cache.js").PreviewCache
				| null = null;
			const resolverSpy = vi
				.spyOn(resolverModule, "createDesignAssetResolver")
				.mockImplementation((cache) => {
					capturedCache = cache;
					// Return a stub that satisfies the AssetResolver shape (we never call it).
					return {
						scheme: "design",
						resolve: () => null,
					} as unknown as ReturnType<
						typeof resolverModule.createDesignAssetResolver
					>;
				});
			try {
				const plugin = createCanvasStudioPlugin({
					adapter: inMemoryCanvasAdapter(),
				});
				const ctx = makeFakeCtx();
				const registration = plugin.register(ctx);
				registration.hooks?.onInit?.(ctx);

				expect(capturedOptions).not.toBeNull();
				expect(capturedCache).not.toBeNull();
				const stage = {
					toDataURL: vi.fn(() => "data:image/png;base64,ACTIVE"),
				} as unknown as Konva.Stage;
				const ir = makeIR(["p1", "p2", "p3"]);
				await capturedOptions?.onCommitAndClose?.({
					designId: "d1",
					puckNodeId: null,
					artboardId: "p1",
					ir,
					stage,
				});

				// All three artboards must have a cache entry, and the default
				// bucket must resolve to the active artboard's preview.
				expect(capturedCache?.get("d1", "p1")).toBe(
					"data:image/png;base64,ACTIVE",
				);
				expect(capturedCache?.get("d1", "p2")).toBe(
					"data:image/png;base64,RASTER-p2",
				);
				expect(capturedCache?.get("d1", "p3")).toBe(
					"data:image/png;base64,RASTER-p3",
				);
				expect(capturedCache?.get("d1")).toBe("data:image/png;base64,ACTIVE");
			} finally {
				spy.mockRestore();
				resolverSpy.mockRestore();
			}
		});

		it("patches the source DesignBlock via a Puck `replace` at the root zone (regression)", async () => {
			// Regression: the commit-and-close bridge dispatches a Puck `replace`
			// to write `previewUrl` back onto the DesignBlock. Puck keys root
			// content under "root:default-zone"; a bare "default-zone" made
			// `replaceAction` read `state.indexes.zones[undefined].contentIds` →
			// "Cannot read properties of undefined (reading 'contentIds')" when the
			// user clicked Back. This drives the full onCommitAndClose path with a
			// real `puckNodeId` + a fake Puck API and asserts the action shape.
			const overlayModule = await import("../overlays/CanvasModeOverlay.js");
			let capturedOptions:
				| Parameters<typeof overlayModule.createCanvasModeOverlay>[0]
				| null = null;
			const spy = vi
				.spyOn(overlayModule, "createCanvasModeOverlay")
				.mockImplementation((opts) => {
					capturedOptions = opts;
					return () => null;
				});
			try {
				const dispatch = vi.fn();
				const appState = {
					data: {
						content: [{ type: "DesignBlock", props: { id: "n1" } }],
					},
				};
				const ctx = {
					registerLayerQuickAdd: vi.fn(() => () => {
						/* no-op cleanup */
					}),
					getPuckApi: () => ({ appState, dispatch }),
					emit: vi.fn(),
					log: vi.fn(),
				} as unknown as Parameters<
					ReturnType<typeof createCanvasStudioPlugin>["register"]
				>[0];
				const plugin = createCanvasStudioPlugin({
					adapter: inMemoryCanvasAdapter(),
				});
				const registration = plugin.register(ctx);
				registration.hooks?.onInit?.(ctx);

				const stage = {
					toDataURL: vi.fn(() => "data:image/png;base64,PREVIEW"),
				} as unknown as Konva.Stage;
				await capturedOptions?.onCommitAndClose?.({
					designId: "d1",
					puckNodeId: "n1",
					artboardId: "p1",
					ir: makeIR(["p1"]),
					stage,
				});

				expect(dispatch).toHaveBeenCalledTimes(1);
				const action = dispatch.mock.calls[0]?.[0] as {
					type: string;
					destinationIndex: number;
					destinationZone: string;
					data: { props: Record<string, unknown> };
				};
				expect(action.type).toBe("replace");
				expect(action.destinationIndex).toBe(0);
				// The fix: root content lives at "root:default-zone", not "default-zone".
				expect(action.destinationZone).toBe("root:default-zone");
				expect(action.data.props).toMatchObject({
					id: "n1",
					previewUrl: "data:image/png;base64,PREVIEW",
					artboardId: "p1",
				});
			} finally {
				spy.mockRestore();
			}
		});

		it("end-to-end: overlay onIRChange → designCatalog → getArtboardCatalog round-trip", async () => {
			// Spy on `createCanvasModeOverlay` to capture the options the
			// plugin passes (including the `onIRChange` callback we wire to
			// `designCatalog.set`). This proves the binding between the
			// overlay's IR feed and the catalog reads done via
			// `setArtboardCatalog`, which the previous tests cover only at
			// the endpoints.
			const overlayModule = await import("../overlays/CanvasModeOverlay.js");
			let capturedOptions:
				| Parameters<typeof overlayModule.createCanvasModeOverlay>[0]
				| null = null;
			const spy = vi
				.spyOn(overlayModule, "createCanvasModeOverlay")
				.mockImplementation((opts) => {
					capturedOptions = opts;
					return () => null;
				});

			try {
				const plugin = createCanvasStudioPlugin({
					adapter: inMemoryCanvasAdapter(),
				});
				const ctx = makeFakeCtx();
				const registration = plugin.register(ctx);
				registration.hooks?.onInit?.(ctx);

				expect(capturedOptions).not.toBeNull();
				expect(typeof capturedOptions?.onIRChange).toBe("function");

				capturedOptions?.onIRChange?.("d1", [
					{ id: "p1", label: "Cover" },
					{ id: "p2" },
				]);
				const fn = getArtboardCatalog();
				expect(fn?.("d1")).toEqual([
					{ id: "p1", label: "Cover" },
					{ id: "p2" },
				]);
				// Untouched designs still return [].
				expect(fn?.("other")).toEqual([]);
			} finally {
				spy.mockRestore();
			}
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
