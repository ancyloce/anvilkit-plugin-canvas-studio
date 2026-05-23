import type { BrandKit } from "@anvilkit/canvas-editor";
import type { StudioConfig } from "@anvilkit/core";

/**
 * Projects the host {@link StudioConfig} brand fields onto the canvas
 * editor's {@link BrandKit} (I3-4). Uses `config.brandKit.colors`/`fonts`
 * verbatim and — when the chrome's `branding.primaryColor` is set and not
 * already among the swatches — prepends it as a "Primary" swatch so the
 * canvas surfaces the same accent the editor chrome uses.
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
