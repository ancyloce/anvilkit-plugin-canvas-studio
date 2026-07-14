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
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
