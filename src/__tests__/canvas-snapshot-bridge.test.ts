import { createCanvasIR, createPage } from "@anvilkit/canvas-core";
import type { StudioPluginContext } from "@anvilkit/core";
import { describe, expect, it, vi } from "vitest";
import { inMemoryCanvasSnapshotAdapter } from "../adapters/in-memory-snapshot.js";
import {
	CANVAS_KEYSPACE,
	createCanvasSnapshotBridge,
	OPEN_REQUESTED_EVENT,
	SAVE_REQUESTED_EVENT,
} from "../state/canvas-snapshot-bridge.js";

function fakeCtx() {
	return {
		emit: vi.fn(),
		log: vi.fn(),
	} as unknown as StudioPluginContext;
}

function blankIR(id = "d1") {
	return createCanvasIR({
		id,
		title: id,
		pages: [createPage({ id: `${id}-p1` })],
	});
}

describe("createCanvasSnapshotBridge", () => {
	it("save persists through the adapter and emits version-history:save-requested with canvas keyspace", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const ctx = fakeCtx();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => ctx,
		});
		const id = await bridge.saveSnapshot("d1", blankIR("d1"));
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
		expect(ctx.emit).toHaveBeenCalledTimes(1);
		expect(ctx.emit).toHaveBeenCalledWith(SAVE_REQUESTED_EVENT, {
			keyspace: CANVAS_KEYSPACE,
			designId: "d1",
			snapshotId: id,
		});
		const list = await bridge.listSnapshots("d1");
		expect(list).toHaveLength(1);
		expect(list[0]?.id).toBe(id);
		expect(list[0]?.designId).toBe("d1");
	});

	it("forwards a label to the adapter when provided", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		await bridge.saveSnapshot("d1", blankIR("d1"), { label: "before-ai" });
		const list = await bridge.listSnapshots("d1");
		expect(list[0]?.label).toBe("before-ai");
	});

	it("requestOpen emits version-history:open-requested with canvas keyspace and returns the snapshot list", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const ctx = fakeCtx();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => ctx,
		});
		await bridge.saveSnapshot("d1", blankIR("d1"));
		(ctx.emit as ReturnType<typeof vi.fn>).mockClear();
		const list = await bridge.requestOpen("d1");
		expect(list).toHaveLength(1);
		expect(ctx.emit).toHaveBeenCalledTimes(1);
		expect(ctx.emit).toHaveBeenCalledWith(OPEN_REQUESTED_EVENT, {
			keyspace: CANVAS_KEYSPACE,
			designId: "d1",
		});
	});

	it("loadSnapshot round-trips IR through the adapter", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		const ir = blankIR("d1");
		const id = await bridge.saveSnapshot("d1", ir);
		const loaded = await bridge.loadSnapshot("d1", id);
		expect(loaded?.id).toBe(ir.id);
		expect(loaded?.pages).toHaveLength(1);
	});

	it("loadSnapshot returns null for unknown ids", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		const result = await bridge.loadSnapshot("d1", "missing");
		expect(result).toBeNull();
	});

	it("deleteSnapshot is a no-op when the adapter does not implement delete", async () => {
		const adapter: ReturnType<typeof inMemoryCanvasSnapshotAdapter> = {
			...inMemoryCanvasSnapshotAdapter(),
		};
		delete (adapter as { delete?: unknown }).delete;
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		await expect(bridge.deleteSnapshot("d1", "x")).resolves.toBeUndefined();
	});

	it("deleteSnapshot forwards to the adapter when implemented", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		const id = await bridge.saveSnapshot("d1", blankIR("d1"));
		await bridge.deleteSnapshot("d1", id);
		const list = await bridge.listSnapshots("d1");
		expect(list).toHaveLength(0);
	});

	it("getCtx returning null swallows emit calls without throwing", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => null,
		});
		await expect(bridge.saveSnapshot("d1", blankIR("d1"))).resolves.toBeTypeOf(
			"string",
		);
		await expect(bridge.requestOpen("d1")).resolves.toBeDefined();
	});

	it("isolates snapshots by designId (the canvas: keyspace dimension)", async () => {
		const adapter = inMemoryCanvasSnapshotAdapter();
		const bridge = createCanvasSnapshotBridge({
			adapter,
			getCtx: () => fakeCtx(),
		});
		await bridge.saveSnapshot("d1", blankIR("d1"));
		await bridge.saveSnapshot("d2", blankIR("d2"));
		const l1 = await bridge.listSnapshots("d1");
		const l2 = await bridge.listSnapshots("d2");
		expect(l1).toHaveLength(1);
		expect(l2).toHaveLength(1);
		expect(l1[0]?.designId).toBe("d1");
		expect(l2[0]?.designId).toBe("d2");
	});
});
