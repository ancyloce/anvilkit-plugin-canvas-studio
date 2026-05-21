export interface CanvasModeState {
	/** When true, the CanvasModeOverlay mounts the canvas full-screen. */
	readonly open: boolean;
	/**
	 * The DesignBlock node id this session is editing — captured from the
	 * Puck selection when the user clicked the toggle. `null` means the
	 * overlay is editing a brand-new design that has not been inserted
	 * into the Puck page yet.
	 */
	readonly puckNodeId: string | null;
	/** Canonical design id loaded into the overlay. */
	readonly designId: string;
	/** Optional artboard id (reserved for I1-2). */
	readonly artboardId: string | null;
}

export interface CanvasModeStoreApi {
	getState: () => CanvasModeState;
	subscribe: (listener: () => void) => () => void;
	openEditor: (input: {
		designId: string;
		puckNodeId: string | null;
		artboardId?: string | null;
	}) => void;
	closeEditor: () => void;
}

const initialState: CanvasModeState = {
	open: false,
	puckNodeId: null,
	designId: "",
	artboardId: null,
};

/**
 * Minimal subscribable store for the canvas overlay's open/closed flag and
 * the design id currently being edited. Avoids pulling in zustand at the
 * plugin layer (canvas-editor already depends on it, but we keep this
 * package lighter).
 */
export function createCanvasModeStore(): CanvasModeStoreApi {
	let state: CanvasModeState = initialState;
	const listeners = new Set<() => void>();

	function emit() {
		for (const l of listeners) l();
	}

	return {
		getState() {
			return state;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		openEditor({ designId, puckNodeId, artboardId }) {
			state = {
				open: true,
				designId,
				puckNodeId,
				artboardId: artboardId ?? null,
			};
			emit();
		},
		closeEditor() {
			state = { ...state, open: false };
			emit();
		},
	};
}
