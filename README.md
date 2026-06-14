# @anvilkit/plugin-canvas-studio

> **Alpha (`0.1.2`).** API may change before `1.0`.

Mounts a full-screen **Canvas Studio** editing surface inside the Puck-based
`<Studio>` shell. A header action toggles between Puck page mode and a canvas
overlay; on close the plugin persists the `CanvasIR` through a host-provided
adapter, rasterizes each artboard to a preview, and patches the originating Puck
`DesignBlock` so the page renders the thumbnail. It also registers a layer
quick-add for inserting design blocks and a `design://` asset resolver so pages
can reference artboard previews by design id.

## Installation

```sh
pnpm add @anvilkit/plugin-canvas-studio @anvilkit/canvas-core @anvilkit/canvas-editor react react-dom @puckeditor/core
```

Peer dependencies: `@anvilkit/canvas-core`, `@anvilkit/canvas-editor`,
`@puckeditor/core ^0.21.3`, `react >=19.0.0`,
`react-dom >=19.0.0`. (`@anvilkit/core`, `@anvilkit/design-block`, and
`@anvilkit/plugin-asset-manager` ship as direct dependencies.)

The canvas overlay renders with the compiled editor stylesheet — the host must
import it once, e.g. in the app entry:

```ts
import "@anvilkit/canvas-editor/styles.css";
```

Tailwind utilities and parent-document CSS do **not** reach the canvas; the editor
ships its own self-contained stylesheet.

## Quickstart

```ts
import { Studio } from "@anvilkit/core";
import {
  createCanvasStudioPlugin,
  localStorageCanvasAdapter,
} from "@anvilkit/plugin-canvas-studio";
import "@anvilkit/canvas-editor/styles.css";

const canvasStudio = createCanvasStudioPlugin({
  adapter: localStorageCanvasAdapter({ namespace: "demo-canvas" }),
  // The editor's image tool resolves to a host asset id; seed it so the
  // returned id always maps to renderable bytes.
  onPickAsset: async () => "host-image",
  seedAssets: {
    "host-image": { id: "host-image", uri: "data:image/png;base64,…" },
  },
});

<Studio puckConfig={puckConfig} plugins={[canvasStudio]} />;
```

## Core features

- **Mode switch** — a header action (`canvas-studio:toggle`) flips between Puck
  page editing and the full-screen canvas overlay.
- **Host-owned persistence** — designs are saved/loaded through a
  `CanvasPersistenceAdapter` you implement (Postgres, S3, IndexedDB, …). Two
  reference adapters ship: `inMemoryCanvasAdapter` (transient) and
  `localStorageCanvasAdapter` (browser, demo-grade).
- **Artboard preview round-trip** — on close, each artboard is rasterized and the
  preview URL is patched back onto the originating Puck `DesignBlock` node.
- **Design-block quick-add** — inserts a `DesignBlock` placeholder into the page
  and stages a fresh design id in the overlay.
- **`design://` resolver** — resolves `design://<designId>` references in the IR
  resolver chain to cached artboard previews.
- **Version-history bridge** — wires canvas snapshots into the `canvas:` keyspace
  via a `CanvasSnapshotAdapter`, compatible with `@anvilkit/plugin-version-history`.

## API reference

### Factory

```ts
function createCanvasStudioPlugin(
  options: CreateCanvasStudioPluginOptions,
): StudioPlugin;
```

| Field                      | Type                                       | Default                           | Purpose                                                                                                                                        |
| -------------------------- | ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`                  | `CanvasPersistenceAdapter`                 | _required_                        | Host persistence for canvas designs (`save` / `load` / `list` / `delete?`).                                                                    |
| `designBlockComponentType` | `string`                                   | `"DesignBlock"`                   | Puck component type id treated as a design block.                                                                                              |
| `canvasSnapshotAdapter`    | `CanvasSnapshotAdapter`                    | `inMemoryCanvasSnapshotAdapter()` | Version-history snapshot store for canvas designs. Supply a durable one for persistent history.                                                |
| `onPickAsset`              | `() => Promise<string>`                    | none                              | Host image picker for the editor's `image` tool. Resolve with a (seeded) asset id; reject or `""` cancels. Omit to leave the tool inert.       |
| `seedAssets`               | `Readonly<Record<string, CanvasAssetRef>>` | none                              | Host asset-library entries merged into every opened design so `onPickAsset` ids resolve to bytes. The design's own assets win on id collision. |

### Adapter contracts

```ts
interface CanvasPersistenceAdapter {
  save(designId: string, ir: CanvasIR): MaybePromise<void>;
  load(designId: string): MaybePromise<CanvasIR | null>;
  list(): MaybePromise<readonly CanvasDesignMeta[]>;
  delete?(designId: string): MaybePromise<void>;
}

interface CanvasSnapshotAdapter {
  save(
    designId: string,
    ir: CanvasIR,
    meta?: { label?: string },
  ): MaybePromise<string>;
  list(designId: string): MaybePromise<readonly CanvasSnapshotMeta[]>;
  load(designId: string, snapshotId: string): MaybePromise<CanvasIR | null>;
  delete?(designId: string, snapshotId: string): MaybePromise<void>;
}
```

`CanvasSnapshotAdapter` mirrors `@anvilkit/plugin-version-history`'s `SnapshotAdapter`
shape (typed for `CanvasIR`) so one host can wire both Puck PageIR history and
canvas design history into compatible stores.

### Reference adapters

| Export                                     | Returns                    | Notes                                                                                                  |
| ------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `inMemoryCanvasAdapter()`                  | `CanvasPersistenceAdapter` | Transient; loses data on reload.                                                                       |
| `localStorageCanvasAdapter({ namespace })` | `CanvasPersistenceAdapter` | Per-save snapshots under `<namespace>:designs:<id>` + an index key. Throws on SSR (no `localStorage`). |
| `inMemoryCanvasSnapshotAdapter()`          | `CanvasSnapshotAdapter`    | Default in-process snapshot store used when `canvasSnapshotAdapter` is omitted.                        |

### Composable building blocks

The plugin wires these internally, but each is exported for hosts assembling a
custom integration:

| Export                                       | Purpose                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createModeSwitchAction`                     | Header action that toggles canvas mode. Id: `MODE_SWITCH_ACTION_ID` (`"canvas-studio:toggle"`).                                                                                                                          |
| `createDesignBlockQuickAdd`                  | Layer quick-add for `DesignBlock`. Id: `DESIGN_BLOCK_QUICK_ADD_ID` (`"canvas-studio:add-design-block"`).                                                                                                                 |
| `createCanvasModeOverlay`                    | Builds the overlay component (`<CanvasWorkspace>` host) mounted in canvas mode.                                                                                                                                          |
| `createDesignAssetResolver`                  | `design://` IR asset resolver. Prefix: `DESIGN_REFERENCE_PREFIX` (`"design://"`).                                                                                                                                        |
| `createCanvasSnapshotBridge`                 | Bridges canvas snapshots into version-history events under `CANVAS_KEYSPACE` (`"canvas"`). Reuses `version-history:save-requested` / `version-history:open-requested` (`SAVE_REQUESTED_EVENT` / `OPEN_REQUESTED_EVENT`). |
| `createCanvasModeStore`                      | Standalone mode-state store (`CanvasModeState` / `CanvasModeStoreApi`).                                                                                                                                                  |
| `createPreviewCache`                         | Artboard-preview URL cache (`PreviewCache`).                                                                                                                                                                             |
| `exportCanvasToAsset` / `exportAllArtboards` | Rasterize a single artboard / every artboard to preview data URLs (`CanvasExportInput`, `CanvasExportResult`, `ExportAllArtboardsInput`, `ExportAllArtboardsResult`).                                                    |
| `CANVAS_STUDIO_PLUGIN_META`                  | The plugin metadata constant.                                                                                                                                                                                            |

## Usage examples

### Transient in-memory designs (tests / ephemeral demos)

```ts
import { Studio } from "@anvilkit/core";
import {
  createCanvasStudioPlugin,
  inMemoryCanvasAdapter,
} from "@anvilkit/plugin-canvas-studio";

// Designs live only for the session — handy for tests and throwaway demos.
const canvasStudio = createCanvasStudioPlugin({
  adapter: inMemoryCanvasAdapter(),
});

<Studio puckConfig={puckConfig} plugins={[canvasStudio]} />;
```

### Custom host-backed persistence adapter

Implement the `CanvasPersistenceAdapter` contract against your own backend
(Postgres, S3, IndexedDB, an HTTP API). `save` / `load` / `list` may be sync or
async.

```ts
import {
  createCanvasStudioPlugin,
  type CanvasPersistenceAdapter,
} from "@anvilkit/plugin-canvas-studio";

const httpAdapter: CanvasPersistenceAdapter = {
  save: (designId, ir) =>
    fetch(`/api/designs/${designId}`, {
      method: "PUT",
      body: JSON.stringify(ir),
    }).then(() => undefined),
  load: (designId) =>
    fetch(`/api/designs/${designId}`).then((res) =>
      res.ok ? res.json() : null,
    ),
  list: () => fetch("/api/designs").then((res) => res.json()),
};

const canvasStudio = createCanvasStudioPlugin({ adapter: httpAdapter });
```

## Notes & FAQ

### Persistence happens on close

The overlay holds the live `CanvasIR` while open; the host adapter's `save()` runs
when the user exits canvas mode (alongside artboard export and the `DesignBlock`
preview patch). There is no incremental autosave at the adapter layer.

### `onPickAsset` + `seedAssets` go together

Canvas commands cannot add assets to a live scene, so an id returned by
`onPickAsset` must already exist in the design. Seed host-library entries via
`seedAssets` so picked ids resolve to renderable bytes. The design's own assets win
on id collision.

### Version-history integration is opt-in for durability

Without `canvasSnapshotAdapter`, snapshots live in an in-process store and are lost
on reload. Implement `CanvasSnapshotAdapter` against a durable backend (and pair it
with `@anvilkit/plugin-version-history`) for persistent canvas history.

## License

MIT
