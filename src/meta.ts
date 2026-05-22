import type { StudioPluginMeta } from "@anvilkit/core";
import { Frame } from "lucide-react";
import { createElement } from "react";

import config from "../meta/config.json";
import packageJson from "../package.json";

// `version` is derived from package.json so a Changesets bump can never drift
// the runtime metadata.
export const CANVAS_STUDIO_PLUGIN_META: StudioPluginMeta = {
	...config,
	version: packageJson.version,
	icon: createElement(Frame),
};
