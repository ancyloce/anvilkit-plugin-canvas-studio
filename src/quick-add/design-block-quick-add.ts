import type { StudioLayerQuickAdd } from "@anvilkit/core";
import type { CanvasModeStoreApi } from "../state/mode-store.js";

export interface CreateDesignBlockQuickAddOptions {
	readonly modeStore: CanvasModeStoreApi;
	/** Defaults to "DesignBlock" — override only if the host renames the Puck component. */
	readonly componentType?: string;
}

export const DESIGN_BLOCK_QUICK_ADD_ID = "canvas-studio:add-design-block";

export function createDesignBlockQuickAdd(
	options: CreateDesignBlockQuickAddOptions,
): StudioLayerQuickAdd {
	const componentType = options.componentType ?? "DesignBlock";
	return {
		id: DESIGN_BLOCK_QUICK_ADD_ID,
		labelKey: "canvas-studio.layer.quickadd.designBlock",
		icon: "shapes",
		order: 50,
		insert: ({ puckApi }) => {
			const fresh =
				typeof crypto !== "undefined" && "randomUUID" in crypto
					? crypto.randomUUID()
					: `design-${Date.now().toString(36)}`;
			puckApi.dispatch({
				type: "insert",
				componentType,
				destinationIndex: puckApi.appState.data.content.length,
				destinationZone: "default-zone",
			});
			// Stage the editor session to open against the new design id. The
			// user can click the mode-switch action next to start designing.
			// (We do not auto-open here — that would yank focus mid-insert.)
			options.modeStore.openEditor({
				designId: fresh,
				puckNodeId: null,
			});
		},
	};
}
