import {
	type CanvasIR,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import { act, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the `<CanvasStudio>` props each time it's rendered so the test
// can drive its `onChange` from outside.
let capturedStudioProps: ComponentProps<
	typeof import("@anvilkit/canvas-editor").CanvasStudio
> | null = null;

vi.mock("@anvilkit/canvas-editor", () => ({
	CanvasStudio: (
		props: ComponentProps<
			typeof import("@anvilkit/canvas-editor").CanvasStudio
		>,
	) => {
		capturedStudioProps = props;
		return <div data-testid="canvas-studio-mock" />;
	},
}));

import {
	createCanvasModeOverlay,
	pagesToCatalogEntries,
} from "../overlays/CanvasModeOverlay.js";
import { createCanvasModeStore } from "../state/mode-store.js";
import type { CanvasPersistenceAdapter } from "../types.js";

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

		render(<Overlay />);
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

		render(<Overlay />);
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

		render(<Overlay />);
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
