/**
 * @file The `canvas-studio` registry entry (pure data — no React) plus the
 * `AnvilkitMessages` type augmentation.
 *
 * Namespace is `canvas-studio` (hyphenated) to match the EXISTING
 * `labelKey: "canvas-studio.layer.quickadd.designBlock"` the layer quick-add
 * already ships — NOT the core-reserved `canvas` namespace, which belongs to
 * the canvas-editor surface (P7 bridge). Message content lives in
 * `i18n/messages/<locale>.json`; English ships inline and other locales
 * lazy-load.
 *
 * Scope: only the plugin's OWN in-Studio chrome (mode-switch action, overlay
 * loading state, quick-add label). The canvas-editor's own `canvas.*` strings
 * (WorkspaceHeader, panels, …) are P7 and live in `@anvilkit/canvas-editor`.
 */

import type { RegistryEntry } from "@anvilkit/core/i18n";

// Messages live at the plugin-root `i18n/messages/` (shipped via the package
// `files`). Imported from outside `src/` so the bundleless rslib build keeps
// them external `.json` — same pattern as `meta/config.json`.
import enMessages from "../../i18n/messages/en.json" with { type: "json" };

/** Static lazy-pack map (avoids a dynamic template `import()` under rslib). */
const LOCALE_PACKS: Readonly<
	Record<string, () => Promise<{ readonly default: Record<string, string> }>>
> = {
	zh: () => import("../../i18n/messages/zh.json", { with: { type: "json" } }),
};

/** The registry entry contributed to the catalog (core prepends `studio.*`). */
export const CANVAS_STUDIO_ENTRY: RegistryEntry = {
	namespace: "canvas-studio",
	en: enMessages,
	loadMessages: async (locale) => {
		const pack = LOCALE_PACKS[locale];
		return pack === undefined ? {} : (await pack()).default;
	},
};

/** Exact key union for the `AnvilkitMessages` augmentation. */
export type CanvasStudioMessageKey = keyof typeof enMessages;

// Augment the public key registry so `useT("canvas-studio.*")` autocompletes.
declare module "@anvilkit/core/i18n" {
	interface AnvilkitMessages extends Record<CanvasStudioMessageKey, string> {}
}
