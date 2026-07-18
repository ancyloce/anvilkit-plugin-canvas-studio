import {
	type CanvasIR,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import {
	createStudioConfig,
	StudioConfigProvider,
} from "@anvilkit/core/config";
import { act, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The overlay mounts `<CanvasWorkspace>` (the full editor shell). Capture its
// props each render so the test can drive `onChange` from outside and assert
// the forwarded `brandKit`. `CanvasWorkspace` forwards these props straight to
// the headless `<CanvasStudio>`, so the prop contract these tests check is
// unchanged by the shell swap.
let capturedStudioProps: ComponentProps<
	typeof import("@anvilkit/canvas-editor").CanvasWorkspace
> | null = null;

vi.mock("@anvilkit/canvas-editor", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@anvilkit/canvas-editor")>();
	return {
		...actual,
		CanvasWorkspace: (
			props: ComponentProps<
				typeof import("@anvilkit/canvas-editor").CanvasWorkspace
			>,
		) => {
			capturedStudioProps = props;
			return <div data-testid="canvas-studio-mock" />;
		},
	};
});

import {
	createCanvasModeOverlay,
	pagesToCatalogEntries,
} from "../overlays/CanvasModeOverlay.js";
import { createCanvasModeStore } from "../state/mode-store.js";
import type { CanvasPersistenceAdapter } from "../types/types.js";

function makeAdapter(initial: CanvasIR | null): CanvasPersistenceAdapter {
	return {
		load: vi.fn(async () => initial),
		save: vi.fn(async () => {
			// no-op: tests don't assert persistence here
		}),
	};
}

function makeIR(designId: string, pageIds: ReadonlyArray<[string, string?]>) {
	return createCanvasIR({
		id: designId,
		title: designId,
		pages: pageIds.map(([id, name]) =>
			createPage(name !== undefined ? { id, name } : { id }),
		),
	});
}

// The overlay reads `useStudioConfig()` (I3-4), so it must render inside a
// StudioConfigProvider — mirroring production, where it mounts inside <Studio>.
function renderOverlay(
	Overlay: ReturnType<typeof createCanvasModeOverlay>,
	config = createStudioConfig(),
) {
	return render(
		<StudioConfigProvider config={config}>
			<Overlay />
		</StudioConfigProvider>,
	);
}

describe("pagesToCatalogEntries", () => {
	it("returns id-only entries when pages have no name", () => {
		const ir = makeIR("d1", [["a"], ["b"]]);
		expect(pagesToCatalogEntries(ir.pages)).toEqual([{ id: "a" }, { id: "b" }]);
	});

	it("returns id+label entries when pages have a name", () => {
		const ir = makeIR("d1", [
			["a", "Cover"],
			["b", "Back"],
		]);
		expect(pagesToCatalogEntries(ir.pages)).toEqual([
			{ id: "a", label: "Cover" },
			{ id: "b", label: "Back" },
		]);
	});

	it("treats empty-string name as missing (no label key)", () => {
		const ir = makeIR("d1", [["a", ""]]);
		expect(pagesToCatalogEntries(ir.pages)).toEqual([{ id: "a" }]);
	});
});

describe("CanvasModeOverlay onIRChange", () => {
	beforeEach(() => {
		capturedStudioProps = null;
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("fires after the initial IR load with entries derived from ir.pages", async () => {
		const onIRChange = vi.fn();
		const modeStore = createCanvasModeStore();
		const initialIR = makeIR("d1", [["p1", "Cover"], ["p2"]]);
		const adapter = makeAdapter(initialIR);
		const Overlay = createCanvasModeOverlay({
			modeStore,
			adapter,
			onIRChange,
		});

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "d1", puckNodeId: null });
		});

		await waitFor(() => {
			expect(onIRChange).toHaveBeenCalled();
		});
		expect(onIRChange).toHaveBeenCalledWith("d1", [
			{ id: "p1", label: "Cover" },
			{ id: "p2" },
		]);
	});

	it("fires again from the <CanvasStudio> onChange with updated entries", async () => {
		const onIRChange = vi.fn();
		const modeStore = createCanvasModeStore();
		const initialIR = makeIR("d2", [["p1"]]);
		const adapter = makeAdapter(initialIR);
		const Overlay = createCanvasModeOverlay({
			modeStore,
			adapter,
			onIRChange,
		});

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "d2", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		onIRChange.mockClear();

		const updatedIR = makeIR("d2", [
			["p1", "Renamed"],
			["p2", "Added"],
		]);
		act(() => {
			capturedStudioProps?.onChange?.(updatedIR);
		});

		expect(onIRChange).toHaveBeenCalledTimes(1);
		expect(onIRChange).toHaveBeenCalledWith("d2", [
			{ id: "p1", label: "Renamed" },
			{ id: "p2", label: "Added" },
		]);
	});

	it("mints a blank IR + fires onIRChange when the adapter returns null", async () => {
		const onIRChange = vi.fn();
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(null);
		const Overlay = createCanvasModeOverlay({
			modeStore,
			adapter,
			onIRChange,
		});

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "fresh", puckNodeId: null });
		});

		await waitFor(() => {
			expect(onIRChange).toHaveBeenCalledTimes(1);
		});
		// Default minted IR uses `${designId}-page` as the single page id.
		expect(onIRChange).toHaveBeenCalledWith("fresh", [{ id: "fresh-page" }]);
	});
});

describe("CanvasModeOverlay editor shell (regression)", () => {
	beforeEach(() => {
		capturedStudioProps = null;
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	// Regression: the overlay must mount the full `<CanvasWorkspace>` editor
	// shell (toolbar, panel dock, inspector), NOT the bare headless
	// `<CanvasStudio>` — which renders only a stage and ships no chrome, so the
	// overlay opened to a blank white canvas with no way to edit. The vi.mock
	// above only stubs `CanvasWorkspace`; if the overlay reverted to
	// `CanvasStudio`, `capturedStudioProps` would stay null and this fails.
	it("mounts the CanvasWorkspace shell with onBack + a stable per-design storeId", async () => {
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR("d-shell", [["p1"]]));
		const Overlay = createCanvasModeOverlay({ modeStore, adapter });

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "d-shell", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		// "Back" is wired so the workspace header runs the commit-and-close bridge.
		expect(typeof capturedStudioProps?.onBack).toBe("function");
		// Per-design store id isolates the workspace UI slice (active tab, etc.).
		expect(capturedStudioProps?.storeId).toBe("d-shell");
	});

	// The image tool calls `onPickAsset()` for an asset id, then renders the
	// placed node from `ir.assets[id]` (no command can add an asset to a live
	// scene). So the overlay must (1) forward the host picker and (2) merge
	// host `seedAssets` into the opened design, or placed images never resolve.
	it("forwards onPickAsset and merges seedAssets into the opened design", async () => {
		const onPickAsset = vi.fn(async () => "host-img");
		const seedAssets = {
			"host-img": { id: "host-img", uri: "data:image/png;base64,AAAA" },
		};
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR("d-asset", [["p1"]]));
		const Overlay = createCanvasModeOverlay({
			modeStore,
			adapter,
			onPickAsset,
			seedAssets,
		});

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "d-asset", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		expect(capturedStudioProps?.onPickAsset).toBe(onPickAsset);
		expect(capturedStudioProps?.initialIR.assets["host-img"]).toEqual(
			seedAssets["host-img"],
		);
	});
});

describe("CanvasModeOverlay brandKit (I3-4)", () => {
	beforeEach(() => {
		capturedStudioProps = null;
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("maps the Studio config brandKit (+ branding.primaryColor) onto the CanvasStudio brandKit prop", async () => {
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR("d3", [["p1"]]));
		const Overlay = createCanvasModeOverlay({ modeStore, adapter });
		const config = createStudioConfig({
			branding: { primaryColor: "#2563eb" },
			brandKit: {
				colors: [{ name: "Accent", value: "#f59e0b" }],
				fonts: ["Inter", "Poppins"],
			},
		});

		renderOverlay(Overlay, config);
		act(() => {
			modeStore.openEditor({ designId: "d3", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		// primaryColor is prepended as "Primary"; explicit swatches follow.
		expect(capturedStudioProps?.brandKit).toEqual({
			colors: [
				{ name: "Primary", value: "#2563eb" },
				{ name: "Accent", value: "#f59e0b" },
			],
			fonts: ["Inter", "Poppins"],
		});
	});

	it("passes an empty brand kit when the host configures none", async () => {
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR("d4", [["p1"]]));
		const Overlay = createCanvasModeOverlay({ modeStore, adapter });

		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId: "d4", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		expect(capturedStudioProps?.brandKit).toEqual({ colors: [], fonts: [] });
	});

	it("prefers a factory-supplied BrandKitDefinition over StudioConfig.brandKit (canvas-m2-005, FR-031)", async () => {
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR("d5", [["p1"]]));
		const Overlay = createCanvasModeOverlay({
			modeStore,
			adapter,
			brandKit: {
				id: "kit1",
				name: "Acme",
				logos: [{ id: "logo1", name: "Wordmark", uri: "asset://logo1" }],
				colors: [{ id: "c1", name: "Primary", value: "#111111" }],
				fonts: [{ id: "f1", name: "Body", family: "Inter" }],
				typography: [{ id: "heading", name: "Heading", fontSize: 32 }],
				rules: [{ id: "r1", kind: "forbidden-color", value: "#ff0000" }],
			},
		});
		// A StudioConfig brandKit is ALSO configured, to prove the factory
		// option wins rather than merging or being overridden.
		const config = createStudioConfig({
			brandKit: { colors: [{ name: "Ignored", value: "#f59e0b" }], fonts: [] },
		});

		renderOverlay(Overlay, config);
		act(() => {
			modeStore.openEditor({ designId: "d5", puckNodeId: null });
		});

		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		expect(capturedStudioProps?.brandKit).toEqual({
			id: "kit1",
			name: "Acme",
			logos: [{ id: "logo1", name: "Wordmark", uri: "asset://logo1" }],
			colors: [{ id: "c1", name: "Primary", value: "#111111" }],
			fonts: ["Inter"],
			typography: [{ id: "heading", name: "Heading", fontSize: 32 }],
			imageStylePresets: undefined,
			toneOfVoice: undefined,
			rules: [{ id: "r1", kind: "forbidden-color", value: "#ff0000" }],
			defaultExportPresets: undefined,
			// `brandKitDefinitionToBrandKit` round-trips the full definition so
			// `useBrandKitDefinition()` consumers (logos, rules) can read it back.
			sourceDefinition: {
				id: "kit1",
				name: "Acme",
				logos: [{ id: "logo1", name: "Wordmark", uri: "asset://logo1" }],
				colors: [{ id: "c1", name: "Primary", value: "#111111" }],
				fonts: [{ id: "f1", name: "Body", family: "Inter" }],
				typography: [{ id: "heading", name: "Heading", fontSize: 32 }],
				rules: [{ id: "r1", kind: "forbidden-color", value: "#ff0000" }],
			},
		});
	});
});

describe("CanvasModeOverlay adapter wiring (PRD 0012 §15.16)", () => {
	beforeEach(() => {
		capturedStudioProps = null;
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	async function openOverlay(
		designId: string,
		options?: Partial<Parameters<typeof createCanvasModeOverlay>[0]>,
	) {
		const modeStore = createCanvasModeStore();
		const adapter = makeAdapter(makeIR(designId, [["p1"]]));
		const Overlay = createCanvasModeOverlay({ modeStore, adapter, ...options });
		renderOverlay(Overlay);
		act(() => {
			modeStore.openEditor({ designId, puckNodeId: null });
		});
		await waitFor(() => {
			expect(capturedStudioProps).not.toBeNull();
		});
		return { adapter };
	}

	it("bridges the editor persistenceAdapter to adapter.save keyed by designId (not ir.id)", async () => {
		const { adapter } = await openOverlay("d-save");
		const persistence = capturedStudioProps?.persistenceAdapter;
		expect(persistence).toBeDefined();
		// A legacy stored IR can carry an id that differs from the overlay's
		// designId; saves must still land on the record `adapter.load` reads.
		const divergentIR = makeIR("legacy-id", [["p1"]]);
		await persistence?.save({
			ir: divergentIR,
			documentId: divergentIR.id,
			revision: 1,
			signal: new AbortController().signal,
		});
		expect(adapter.save).toHaveBeenCalledWith("d-save", divergentIR);
	});

	it("defaults headerPlugins to the built-in export plugin and honors an override", async () => {
		await openOverlay("d-export");
		expect(capturedStudioProps?.headerPlugins).toHaveLength(1);

		capturedStudioProps = null;
		await openOverlay("d-export-2", { headerPlugins: [] });
		expect(capturedStudioProps?.headerPlugins).toEqual([]);
	});

	it("forwards assetUploader and an explicit recoveryAdapter by reference", async () => {
		const assetUploader = { upload: vi.fn(async () => []) };
		const recoveryAdapter = {
			write: vi.fn(async () => undefined),
			read: vi.fn(async () => null),
			clear: vi.fn(async () => undefined),
		};
		await openOverlay("d-fwd", { assetUploader, recoveryAdapter });
		expect(capturedStudioProps?.assetUploader).toBe(assetUploader);
		expect(capturedStudioProps?.recoveryAdapter).toBe(recoveryAdapter);
	});

	it("omits recoveryAdapter when the host passes false", async () => {
		await openOverlay("d-norec", { recoveryAdapter: false });
		expect(capturedStudioProps?.recoveryAdapter).toBeUndefined();
	});
});
