import type { BrandKit } from "@anvilkit/canvas-editor";
import type { StudioConfig } from "@anvilkit/core";

/**
 * Projects the host {@link StudioConfig} brand fields onto the canvas
 * editor's {@link BrandKit} (I3-4). Uses `config.brandKit.colors`/`fonts`
 * verbatim and — when the chrome's `branding.primaryColor` is set and not
 * already among the swatches — prepends it as a "Primary" swatch so the
 * canvas surfaces the same accent the editor chrome uses. Lossless with
 * respect to its source: `StudioConfig.brandKit` (canvas-m2-005, FR-031) is
 * deliberately kept colors/fonts-only, since `@anvilkit/core` must not
 * depend on `@anvilkit/canvas-core` for the richer logos/typography/tone/
 * rules fields — a host that wants those surfaced passes a full
 * `BrandKitDefinition` via `createCanvasStudioPlugin({ brandKit })` instead,
 * which `CanvasModeOverlay` prefers over this projection when present.
 *
 * Declared as a stable module-level function so
 * `useStudioConfig(studioConfigToBrandKit)` memoizes the result by config
 * identity — the canvas editor receives a referentially stable kit and
 * its context value doesn't churn per render.
 */
export function studioConfigToBrandKit(config: StudioConfig): BrandKit {
	const colors = config.brandKit.colors.map((c) => ({
		name: c.name,
		value: c.value,
	}));
	const primary = config.branding.primaryColor;
	if (primary && !colors.some((c) => c.value === primary)) {
		colors.unshift({ name: "Primary", value: primary });
	}
	return { colors, fonts: [...config.brandKit.fonts] };
}
