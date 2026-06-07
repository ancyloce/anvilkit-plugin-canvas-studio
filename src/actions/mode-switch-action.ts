import type { StudioHeaderAction } from "@anvilkit/core";
import type { CanvasModeStoreApi } from "../state/mode-store.js";

export interface CreateModeSwitchActionOptions {
	readonly modeStore: CanvasModeStoreApi;
	/**
	 * Optional resolver: given a Puck selection (or null when nothing is
	 * selected) return the design id + nodeId + (optional) artboardId the
	 * overlay should edit. The default treats any selected `DesignBlock`
	 * node as the target and otherwise allocates a new design id.
	 */
	readonly resolveTarget?: (selection: {
		nodeId: string | null;
		componentType: string | null;
		props: Record<string, unknown> | null;
	}) => {
		designId: string;
		puckNodeId: string | null;
		artboardId?: string | null;
	};
}

export const MODE_SWITCH_ACTION_ID = "canvas-studio:toggle";

function defaultResolveTarget(selection: {
	nodeId: string | null;
	componentType: string | null;
	props: Record<string, unknown> | null;
}): { designId: string; puckNodeId: string | null; artboardId: string | null } {
	if (selection.componentType === "DesignBlock") {
		const existingId =
			typeof selection.props?.designId === "string"
				? (selection.props.designId as string)
				: "";
		if (existingId.length > 0) {
			const storedArtboard =
				typeof selection.props?.artboardId === "string" &&
				(selection.props.artboardId as string).length > 0
					? (selection.props.artboardId as string)
					: null;
			return {
				designId: existingId,
				puckNodeId: selection.nodeId,
				artboardId: storedArtboard,
			};
		}
	}
	const fresh =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `design-${Date.now().toString(36)}`;
	return { designId: fresh, puckNodeId: null, artboardId: null };
}

export function createModeSwitchAction(
	options: CreateModeSwitchActionOptions,
): StudioHeaderAction {
	const resolveTarget = options.resolveTarget ?? defaultResolveTarget;
	return {
		id: MODE_SWITCH_ACTION_ID,
		labelKey: "canvas-studio.action.openCanvas",
		label: "Open Canvas",
		icon: "shapes",
		group: "primary",
		order: 50,
		onClick(ctx) {
			if (options.modeStore.getState().open) {
				options.modeStore.closeEditor();
				return;
			}
			const selection = readSelection(ctx);
			const target = resolveTarget(selection);
			options.modeStore.openEditor({
				designId: target.designId,
				puckNodeId: target.puckNodeId,
				...(target.artboardId !== undefined
					? { artboardId: target.artboardId }
					: {}),
			});
		},
	};
}

function readSelection(ctx: { getPuckApi?: () => unknown }): {
	nodeId: string | null;
	componentType: string | null;
	props: Record<string, unknown> | null;
} {
	const api = ctx.getPuckApi?.();
	if (!api || typeof api !== "object") {
		return { nodeId: null, componentType: null, props: null };
	}
	// PuckApi.appState.ui.itemSelector.{ index, zone } would let us look up
	// the selected item. To keep this plugin headless we use a defensive
	// duck-typed read; consumers can pass their own `resolveTarget` for
	// stricter semantics.
	const appState = (api as { appState?: { ui?: unknown; data?: unknown } })
		.appState;
	const ui = (appState?.ui ?? null) as { itemSelector?: unknown } | null;
	const itemSelector = (ui?.itemSelector ?? null) as {
		index?: number;
		zone?: string;
	} | null;
	if (!itemSelector || typeof itemSelector.index !== "number") {
		return { nodeId: null, componentType: null, props: null };
	}
	const data = (appState?.data ?? null) as {
		content?: ReadonlyArray<{
			type?: string;
			props?: Record<string, unknown> & { id?: string };
		}>;
		zones?: Record<
			string,
			ReadonlyArray<{
				type?: string;
				props?: Record<string, unknown> & { id?: string };
			}>
		>;
	} | null;
	if (!data) return { nodeId: null, componentType: null, props: null };
	const zone = itemSelector.zone;
	const list = zone && zone.length > 0 ? data.zones?.[zone] : data.content;
	const item = list?.[itemSelector.index];
	if (!item) return { nodeId: null, componentType: null, props: null };
	return {
		nodeId: typeof item.props?.id === "string" ? item.props.id : null,
		componentType: typeof item.type === "string" ? item.type : null,
		props: item.props ?? null,
	};
}
