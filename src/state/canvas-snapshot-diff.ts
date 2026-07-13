import {
	type CanvasIR,
	type CanvasNode,
	isContainerNode,
	walkPage,
} from "@anvilkit/canvas-core";

/**
 * Added/removed/modified pages and nodes between two canvas snapshots
 * (FR-073). A structural comparison of two point-in-time `CanvasIR`
 * documents — NOT a replay of the command log between them (that is
 * `@anvilkit/canvas-core`'s `replayChanges`, which requires the actual
 * command sequence; a diff between two saved snapshots has no such log).
 */
export interface CanvasSnapshotDiff {
	readonly addedPageIds: readonly string[];
	readonly removedPageIds: readonly string[];
	readonly modifiedPageIds: readonly string[];
	readonly addedNodeIds: readonly string[];
	readonly removedNodeIds: readonly string[];
	readonly modifiedNodeIds: readonly string[];
}

function collectNodesByPage(
	ir: CanvasIR,
): ReadonlyMap<string, ReadonlyMap<string, CanvasNode>> {
	const byPage = new Map<string, Map<string, CanvasNode>>();
	for (const page of ir.pages) {
		const nodes = new Map<string, CanvasNode>();
		walkPage(page, ({ node }) => {
			nodes.set(node.id, node);
		});
		byPage.set(page.id, nodes);
	}
	return byPage;
}

function pageMetaKey(page: CanvasIR["pages"][number]): string {
	const { root, ...meta } = page;
	void root;
	return JSON.stringify(meta);
}

/**
 * A container node's `children` array changing is already fully captured by
 * added/removed/modified entries for the children themselves — including it
 * here would flag every ancestor container as "modified" on every single
 * child add/remove, drowning out the real signal. Compare only a
 * container's own fields; leaf nodes have no `children` to exclude.
 */
function nodeContentKey(node: CanvasNode): string {
	if (isContainerNode(node)) {
		const { children, ...ownFields } = node;
		void children;
		return JSON.stringify(ownFields);
	}
	return JSON.stringify(node);
}

/**
 * Diff two canvas snapshots (typically `before`/`after` loaded via
 * `CanvasSnapshotBridge.loadSnapshot`). Nodes are matched by their stable
 * id; a node present in both with a different serialized shape counts as
 * modified. A page counts as modified if its own top-level fields changed
 * (name/size/background/variantSource) or if any node it contains was
 * added, removed, or modified.
 */
export function diffCanvasSnapshots(
	before: CanvasIR,
	after: CanvasIR,
): CanvasSnapshotDiff {
	const beforePages = new Map(before.pages.map((p) => [p.id, p]));
	const afterPages = new Map(after.pages.map((p) => [p.id, p]));
	const addedPageIds = [...afterPages.keys()].filter(
		(id) => !beforePages.has(id),
	);
	const removedPageIds = [...beforePages.keys()].filter(
		(id) => !afterPages.has(id),
	);

	const beforeNodesByPage = collectNodesByPage(before);
	const afterNodesByPage = collectNodesByPage(after);
	const beforeNodes = new Map(
		[...beforeNodesByPage.values()].flatMap((m) => [...m]),
	);
	const afterNodes = new Map(
		[...afterNodesByPage.values()].flatMap((m) => [...m]),
	);

	const addedNodeIds = [...afterNodes.keys()].filter(
		(id) => !beforeNodes.has(id),
	);
	const removedNodeIds = [...beforeNodes.keys()].filter(
		(id) => !afterNodes.has(id),
	);
	const modifiedNodeIds = [...afterNodes.keys()].filter((id) => {
		const beforeNode = beforeNodes.get(id);
		const afterNode = afterNodes.get(id);
		if (!beforeNode || !afterNode) return false;
		return nodeContentKey(beforeNode) !== nodeContentKey(afterNode);
	});

	const changedNodeIds = new Set([
		...addedNodeIds,
		...removedNodeIds,
		...modifiedNodeIds,
	]);
	const modifiedPageIds: string[] = [];
	for (const [pageId, afterPage] of afterPages) {
		const beforePage = beforePages.get(pageId);
		if (!beforePage) continue; // added, not modified
		const metaChanged = pageMetaKey(beforePage) !== pageMetaKey(afterPage);
		const pageNodeIds = new Set([
			...(beforeNodesByPage.get(pageId)?.keys() ?? []),
			...(afterNodesByPage.get(pageId)?.keys() ?? []),
		]);
		const nodesChanged = [...pageNodeIds].some((id) => changedNodeIds.has(id));
		if (metaChanged || nodesChanged) modifiedPageIds.push(pageId);
	}

	return {
		addedPageIds,
		removedPageIds,
		modifiedPageIds,
		addedNodeIds,
		removedNodeIds,
		modifiedNodeIds,
	};
}
