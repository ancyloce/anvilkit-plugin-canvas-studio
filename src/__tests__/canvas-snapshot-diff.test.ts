import type { CanvasIR } from "@anvilkit/canvas-core";
import {
	createCanvasIR,
	createPage,
	createRect,
	insertNode,
} from "@anvilkit/canvas-core";
import { describe, expect, it } from "vitest";
import { diffCanvasSnapshots } from "../state/canvas-snapshot-diff.js";

function baseIR(): CanvasIR {
	const page = createPage({ id: "p1" });
	let ir = createCanvasIR({ id: "d1", title: "d1", pages: [page] });
	const rect = createRect({
		id: "r1",
		bounds: { width: 10, height: 10 },
		transform: { x: 0, y: 0 },
	});
	ir = insertNode(ir, { parentId: page.root.id, node: rect });
	return ir;
}

describe("diffCanvasSnapshots", () => {
	it("reports no changes for two identical snapshots", () => {
		const ir = baseIR();
		expect(diffCanvasSnapshots(ir, ir)).toEqual({
			addedPageIds: [],
			removedPageIds: [],
			modifiedPageIds: [],
			addedNodeIds: [],
			removedNodeIds: [],
			modifiedNodeIds: [],
		});
	});

	it("identifies an added node and marks its page modified", () => {
		const before = baseIR();
		const page = before.pages[0];
		if (!page) throw new Error("expected page p1");
		const rect2 = createRect({
			id: "r2",
			bounds: { width: 5, height: 5 },
			transform: { x: 20, y: 20 },
		});
		const after = insertNode(before, { parentId: page.root.id, node: rect2 });

		const diff = diffCanvasSnapshots(before, after);
		expect(diff.addedNodeIds).toEqual(["r2"]);
		expect(diff.removedNodeIds).toEqual([]);
		expect(diff.modifiedNodeIds).toEqual([]);
		expect(diff.modifiedPageIds).toEqual(["p1"]);
	});

	it("identifies a removed node and marks its page modified", () => {
		const before = baseIR();
		const after: CanvasIR = {
			...before,
			pages: before.pages.map((p) =>
				p.id === "p1" ? { ...p, root: { ...p.root, children: [] } } : p,
			),
		};

		const diff = diffCanvasSnapshots(before, after);
		expect(diff.removedNodeIds).toEqual(["r1"]);
		expect(diff.addedNodeIds).toEqual([]);
		expect(diff.modifiedPageIds).toEqual(["p1"]);
	});

	it("identifies a modified node by content change, not identity", () => {
		const before = baseIR();
		const after: CanvasIR = {
			...before,
			pages: before.pages.map((p) =>
				p.id === "p1"
					? {
							...p,
							root: {
								...p.root,
								children: p.root.children.map((n) =>
									n.id === "r1"
										? {
												...n,
												transform: { ...n.transform, x: 999 },
											}
										: n,
								),
							},
						}
					: p,
			),
		};

		const diff = diffCanvasSnapshots(before, after);
		expect(diff.modifiedNodeIds).toEqual(["r1"]);
		expect(diff.addedNodeIds).toEqual([]);
		expect(diff.removedNodeIds).toEqual([]);
		expect(diff.modifiedPageIds).toEqual(["p1"]);
	});

	it("identifies added and removed pages", () => {
		const before = baseIR();
		const newPage = createPage({ id: "p2" });
		const after: CanvasIR = { ...before, pages: [...before.pages, newPage] };

		const diffAdded = diffCanvasSnapshots(before, after);
		expect(diffAdded.addedPageIds).toEqual(["p2"]);
		expect(diffAdded.removedPageIds).toEqual([]);
		expect(diffAdded.modifiedPageIds).toEqual([]);

		const diffRemoved = diffCanvasSnapshots(after, before);
		expect(diffRemoved.removedPageIds).toEqual(["p2"]);
		expect(diffRemoved.addedPageIds).toEqual([]);
	});

	it("marks a page modified when only its top-level metadata changes (no node changes)", () => {
		const before = baseIR();
		const after: CanvasIR = {
			...before,
			pages: before.pages.map((p) =>
				p.id === "p1" ? { ...p, name: "Renamed page" } : p,
			),
		};

		const diff = diffCanvasSnapshots(before, after);
		expect(diff.modifiedPageIds).toEqual(["p1"]);
		expect(diff.addedNodeIds).toEqual([]);
		expect(diff.removedNodeIds).toEqual([]);
		expect(diff.modifiedNodeIds).toEqual([]);
	});
});
