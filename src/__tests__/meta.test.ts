import { describe, expect, it } from "vitest";

import config from "../../meta/config.json";
import packageJson from "../../package.json";
import { CANVAS_STUDIO_PLUGIN_META } from "../meta.js";

describe("CANVAS_STUDIO_PLUGIN_META", () => {
	it("derives version from package.json (guards mirror drift)", () => {
		expect(CANVAS_STUDIO_PLUGIN_META.version).toBe(packageJson.version);
	});

	it("meta/config.json carries no version field (package.json is the source of truth)", () => {
		expect("version" in config).toBe(false);
	});

	it("keeps id and capabilities from meta/config.json", () => {
		expect(CANVAS_STUDIO_PLUGIN_META.id).toBe("@anvilkit/plugin-canvas-studio");
		expect(CANVAS_STUDIO_PLUGIN_META.capabilities).toEqual({ header: true });
	});
});
