import { defineConfig } from "@rslib/core";

export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/**/*.ts",
				"./src/**/*.tsx",
				"!./src/**/*.test.ts",
				"!./src/**/*.test.tsx",
				"!./src/**/__tests__/**",
			],
		},
	},
	lib: [
		{
			bundle: false,
			dts: { autoExtension: true },
			format: "esm",
		},
		{
			bundle: false,
			dts: { autoExtension: true },
			format: "cjs",
		},
	],
	output: {
		target: "web",
		externals: [
			"@anvilkit/canvas-core",
			"@anvilkit/canvas-editor",
			"@anvilkit/core",
			"@anvilkit/plugin-asset-manager",
			"@puckeditor/core",
			"konva",
			"react",
			"react-dom",
		],
	},
});
