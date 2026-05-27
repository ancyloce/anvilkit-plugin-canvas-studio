import type {
	CanvasGroupNode,
	CanvasIR,
	CanvasPage,
} from "@anvilkit/canvas-core";
import type { IRAssetResolver } from "@anvilkit/core";
import { setArtboardCatalog } from "@anvilkit/design-block";
import type Konva from "konva";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@anvilkit/canvas-editor", () => ({
	rasterizePage: vi.fn(async (input: { page: CanvasPage }) => ({
		url: `data:image/png;base64,RASTER-${input.page.id}`,
		mimeType: "image/png" as const,
	})),
	exportStageContentDataURL: (
		stage: Konva.Stage,
		options: Record<string, unknown>,
	) => stage.toDataURL(options),
}));

import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { createCanvasStudioPlugin } from "../plugin.js";

interface PluginHandle {
	resolver: IRAssetResolver;
	commit: (ir: CanvasIR, activeId: string) => Promise<void>;
	teardown: () => void;
}

async function bootPlugin(): Promise<PluginHandle> {
	const overlayModule = await import("../overlays/CanvasModeOverlay.js");
	let capturedOptions:
		| Parameters<typeof overlayModule.createCanvasModeOverlay>[0]
		| null = null;
	const overlaySpy = vi
		.spyOn(overlayModule, "createCanvasModeOverlay")
		.mockImplementation((opts) => {
			capturedOptions = opts;
			return () => null;
		});

	const plugin = createCanvasStudioPlugin({
		adapter: inMemoryCanvasAdapter(),
	});

	let resolver: IRAssetResolver | null = null;
	const ctx = {
		registerAssetResolver: vi.fn((r: IRAssetResolver) => {
			resolver = r;
			return () => undefined;
		}),
		registerLayerQuickAdd: vi.fn(() => () => undefined),
		getPuckApi: () => null,
		emit: vi.fn(),
		log: vi.fn(),
	};
	const registration = plugin.register(
		ctx as unknown as Parameters<typeof plugin.register>[0],
	);
	registration.hooks?.onInit?.(
		ctx as unknown as Parameters<typeof plugin.register>[0],
	);
	if (!resolver) throw new Error("plugin did not register an asset resolver");
	if (!capturedOptions?.onCommitAndClose) {
		throw new Error("plugin did not wire onCommitAndClose");
	}

	const commit = async (ir: CanvasIR, activeId: string) => {
		const stage = {
			toDataURL: vi.fn(() => `data:image/png;base64,ACTIVE-${activeId}`),
		} as unknown as Konva.Stage;
		await capturedOptions?.onCommitAndClose?.({
			designId: ir.id,
			puckNodeId: null,
			artboardId: activeId,
			ir,
			stage,
		});
	};

	return {
		resolver,
		commit,
		teardown: () => {
			registration.hooks?.onDestroy?.(
				ctx as unknown as Parameters<typeof plugin.register>[0],
			);
			overlaySpy.mockRestore();
		},
	};
}

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

function makeIR(id: string, pageIds: ReadonlyArray<string>): CanvasIR {
	return {
		version: "1",
		id,
		title: id,
		pages: pageIds.map(makePage),
		assets: {},
		metadata: {
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	};
}

afterEach(() => {
	setArtboardCatalog(null);
});

describe("multi-artboard export (integration)", () => {
	it("populates per-artboard previews that the design:// resolver returns", async () => {
		const { resolver, commit, teardown } = await bootPlugin();
		try {
			const ir = makeIR("d1", ["p1", "p2", "p3"]);
			await commit(ir, "p1");

			expect(resolver("design://d1/p1")).toEqual({
				url: "data:image/png;base64,ACTIVE-p1",
			});
			expect(resolver("design://d1/p2")).toEqual({
				url: "data:image/png;base64,RASTER-p2",
			});
			expect(resolver("design://d1/p3")).toEqual({
				url: "data:image/png;base64,RASTER-p3",
			});
			// Bare design URL → active artboard's preview (because exportAll
			// seeded the default bucket with writeDefault: true).
			expect(resolver("design://d1")).toEqual({
				url: "data:image/png;base64,ACTIVE-p1",
			});
			// Legacy query form resolves the same as the path form.
			expect(resolver("design://d1?artboard=p2")).toEqual({
				url: "data:image/png;base64,RASTER-p2",
			});
		} finally {
			teardown();
		}
	});

	it("returns null for unknown design or artboard ids", async () => {
		const { resolver, commit, teardown } = await bootPlugin();
		try {
			const ir = makeIR("d1", ["p1", "p2"]);
			await commit(ir, "p1");
			expect(resolver("design://unknown")).toBeNull();
			// Unknown artboard falls back to default bucket (active artboard).
			expect(resolver("design://d1/missing-artboard")).toEqual({
				url: "data:image/png;base64,ACTIVE-p1",
			});
			// Non-design URLs are untouched so the next resolver can handle them.
			expect(resolver("https://example.com/foo.png")).toBeNull();
		} finally {
			teardown();
		}
	});

	it("re-commit on a different active artboard updates the active preview", async () => {
		const { resolver, commit, teardown } = await bootPlugin();
		try {
			const ir = makeIR("d1", ["p1", "p2", "p3"]);
			await commit(ir, "p1");
			expect(resolver("design://d1")).toEqual({
				url: "data:image/png;base64,ACTIVE-p1",
			});
			// Switch active artboard and commit again. The live stage for
			// the new active page produces a distinct ACTIVE-<id> URL, and
			// the default bucket (the bare design:// preview) now resolves
			// to that artboard's preview instead.
			await commit(ir, "p2");
			expect(resolver("design://d1/p2")).toEqual({
				url: "data:image/png;base64,ACTIVE-p2",
			});
			expect(resolver("design://d1")).toEqual({
				url: "data:image/png;base64,ACTIVE-p2",
			});
		} finally {
			teardown();
		}
	});
});
