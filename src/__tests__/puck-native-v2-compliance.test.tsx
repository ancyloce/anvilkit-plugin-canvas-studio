import * as React from "react";

/**
 * @file PLAN-0025 Phase 3.5 (P3.5-04) — Puck-native v2 compliance.
 *
 * The DesignBlock snapshot bridge already writes through PuckApi
 * (`replace` action) and spreads the LIVE node props before patching —
 * this suite locks that §5.1 contract on v2 documents:
 *
 * 1. source scan: no sidecar / sidecar-editor-command reference
 *    anywhere in `src/` (plan §15 gate 3, per package);
 * 2. the full click-to-open → commit-and-close flow patches
 *    `designId` back onto the block while PRESERVING its
 *    `appearance`/`interactions`/`bindings` carriers byte-identically
 *    (pairs with the P3-E DesignBlock adoption).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createStudioConfig,
	StudioConfigProvider,
} from "@anvilkit/core/config";
import { CANVAS_OPEN_EVENT } from "@anvilkit/design-block";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Off-Konva stub, matching the open-canvas-bridge suite — plus a back
// button so the commit-and-close path is drivable.
vi.mock("@anvilkit/canvas-editor", () => ({
	CanvasWorkspace: (props: { onBack?: () => void }) => (
		<button data-testid="mock-back" onClick={props.onBack} type="button">
			back
		</button>
	),
	rasterizePage: vi.fn(async (input: { page: { id: string } }) => ({
		url: `data:image/png;base64,RASTER-${input.page.id}`,
		mimeType: "image/png" as const,
	})),
	createCanvasExportPlugin: () => ({ id: "export-stub" }),
}));

import { inMemoryCanvasAdapter } from "../adapters/in-memory.js";
import { createCanvasStudioPlugin } from "../plugin.js";

const FORBIDDEN = [
	"__anvilkit",
	"readAuthoringState",
	"writeAuthoringState",
	"ANVILKIT_AUTHORING_KEY",
	"EditorCommandPort",
	"applyEditorCommand",
	'"replaceRoot"',
] as const;

function sourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__") continue;
			files.push(...sourceFiles(path));
			continue;
		}
		if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
	}
	return files;
}

const appearance = {
	version: "1",
	targets: { root: { style: { base: { layout: { display: "flex" } } } } },
};
const interactions = [{ id: "i-1", trigger: "click" }];
const bindings = [{ id: "b-1", nodeId: "db-1" }];

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Puck-native v2 compliance (P3.5-04)", () => {
	it("no source file references the sidecar or sidecar editor commands", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(join(__dirname, ".."))) {
			const source = readFileSync(file, "utf8");
			for (const marker of FORBIDDEN) {
				if (source.includes(marker)) offenders.push(`${file}: ${marker}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("commit-and-close patches designId while preserving the block's §5.1 carriers", async () => {
		const dispatch = vi.fn();
		const ctx = {
			registerLayerQuickAdd: vi.fn(() => () => {
				/* no-op cleanup */
			}),
			getPuckApi: () => ({
				appState: {
					data: {
						content: [
							{
								type: "DesignBlock",
								props: {
									id: "db-1",
									designId: "",
									previewUrl: "",
									appearance,
									interactions,
									bindings,
								},
							},
						],
						root: { props: {} },
						zones: {},
					},
				},
				dispatch,
			}),
			emit: vi.fn(),
			log: vi.fn(),
			registerMessages: vi.fn(),
		} as unknown as Parameters<
			ReturnType<typeof createCanvasStudioPlugin>["register"]
		>[0];

		const plugin = createCanvasStudioPlugin({
			adapter: inMemoryCanvasAdapter(),
		});
		const registration = plugin.register(ctx);
		registration.hooks?.onInit?.(ctx);
		const Overlay = registration.overlays?.[0]?.component;
		if (!Overlay) throw new Error("canvas-studio overlay was not registered");

		render(
			<StudioConfigProvider config={createStudioConfig()}>
				<Overlay />
			</StudioConfigProvider>,
		);

		act(() => {
			window.dispatchEvent(
				new CustomEvent(CANVAS_OPEN_EVENT, {
					detail: {
						designId: "design-1",
						puckNodeId: "db-1",
						artboardId: null,
					},
				}),
			);
		});
		await waitFor(() =>
			expect(screen.queryByTestId("mock-back")).not.toBeNull(),
		);

		screen.getByTestId("mock-back").click();
		await waitFor(() => expect(dispatch).toHaveBeenCalled());

		const action = dispatch.mock.calls[0]?.[0] as {
			type: string;
			data: { props: Record<string, unknown> };
		};
		expect(action.type).toBe("replace");
		// The commit writes the design link…
		expect(action.data.props.designId).toBe("design-1");
		// …and the §5.1 carriers ride through byte-identically.
		expect(action.data.props.appearance).toEqual(appearance);
		expect(action.data.props.interactions).toEqual(interactions);
		expect(action.data.props.bindings).toEqual(bindings);
	});
});
