import { createStudioConfig } from "@anvilkit/core/config";
import { describe, expect, it } from "vitest";
import { studioConfigToBrandKit } from "../studio-config-to-brand-kit.js";

describe("studioConfigToBrandKit", () => {
	it("returns an empty kit for a default config", () => {
		expect(studioConfigToBrandKit(createStudioConfig())).toEqual({
			colors: [],
			fonts: [],
		});
	});

	it("prepends branding.primaryColor as a Primary swatch", () => {
		const kit = studioConfigToBrandKit(
			createStudioConfig({
				branding: { primaryColor: "#2563eb" },
				brandKit: {
					colors: [{ name: "Accent", value: "#f59e0b" }],
					fonts: ["Inter"],
				},
			}),
		);
		expect(kit.colors).toEqual([
			{ name: "Primary", value: "#2563eb" },
			{ name: "Accent", value: "#f59e0b" },
		]);
		expect(kit.fonts).toEqual(["Inter"]);
	});

	it("does not duplicate primaryColor when it already appears as a swatch", () => {
		const kit = studioConfigToBrandKit(
			createStudioConfig({
				branding: { primaryColor: "#2563eb" },
				brandKit: {
					colors: [{ name: "Brand Blue", value: "#2563eb" }],
					fonts: [],
				},
			}),
		);
		expect(kit.colors).toEqual([{ name: "Brand Blue", value: "#2563eb" }]);
	});

	it("passes fonts through verbatim", () => {
		const kit = studioConfigToBrandKit(
			createStudioConfig({
				brandKit: { colors: [], fonts: ["Poppins", "Inter"] },
			}),
		);
		expect(kit.fonts).toEqual(["Poppins", "Inter"]);
	});
});
