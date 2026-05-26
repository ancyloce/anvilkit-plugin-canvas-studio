import {
	createStudioConfig,
	StudioConfigProvider,
} from "@anvilkit/core/config";
import { CANVAS_OPEN_EVENT } from "@anvilkit/design-block";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The overlay renders <CanvasWorkspace> when open; stub it so this test stays
// off Konva. rasterizePage is pulled in by the plugin's export bridge.
vi.mock("@anvilkit/canvas-editor", () => ({
	CanvasWorkspace: () => <div data-testid="canvas-studio-mock" />,
	rasterizePage: vi.fn(async (input: { page: { id: string } }) => ({
		url: `data:image/png;base64,RASTER-${input.page.id}`,
		mimeType: "image/png" as const,
	})),
}));

import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { createCanvasStudioPlugin } from "../plugin.js";

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

function dispatchOpen(detail: {
	designId: string;
	puckNodeId: string | null;
	artboardId: string | null;
}) {
	window.dispatchEvent(new CustomEvent(CANVAS_OPEN_EVENT, { detail }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("DesignBlock click-to-open bridge", () => {
	it("opens the canvas overlay when a DesignBlock dispatches CANVAS_OPEN_EVENT", async () => {
		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const ctx = makeFakeCtx();
		const registration = plugin.register(ctx);
		registration.hooks?.onInit?.(ctx);

		const Overlay = registration.overlays?.[0]?.component;
		if (!Overlay) throw new Error("canvas-studio overlay was not registered");

		render(
			<StudioConfigProvider config={createStudioConfig()}>
				<Overlay />
			</StudioConfigProvider>,
		);

		// Closed until the block asks to open.
		expect(screen.queryByTestId("canvas-studio-mock")).toBeNull();

		act(() => {
			dispatchOpen({
				designId: "design-1",
				puckNodeId: "node-1",
				artboardId: null,
			});
		});

		await waitFor(() =>
			expect(screen.queryByTestId("canvas-studio-mock")).not.toBeNull(),
		);
	});

	it("attaches the listener on onInit and detaches it on onDestroy", () => {
		const addSpy = vi.spyOn(window, "addEventListener");
		const removeSpy = vi.spyOn(window, "removeEventListener");

		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const ctx = makeFakeCtx();
		const registration = plugin.register(ctx);

		registration.hooks?.onInit?.(ctx);
		expect(addSpy.mock.calls.some(([type]) => type === CANVAS_OPEN_EVENT)).toBe(
			true,
		);

		registration.hooks?.onDestroy?.();
		expect(
			removeSpy.mock.calls.some(([type]) => type === CANVAS_OPEN_EVENT),
		).toBe(true);
	});
});
