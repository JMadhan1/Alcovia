---
name: Metro 0.84 + Expo 52 compatibility patches
description: All patches applied in apps/client/scripts/patch-metro.js (run as postinstall)
---

## Rule
Never delete or skip `apps/client/scripts/patch-metro.js` — it is essential for expo 52 + metro 0.84 compat.

**Why:** expo@52 ships `@expo/metro-config` that imports metro internals not exported in metro 0.84's package.json. Without patches the bundler crashes at startup.

## Patches applied (in order)

1. **metro** — adds `./src/lib/*`, `./src/DeltaBundler/Serializers/*`, `./src/ModuleGraph/worker/*`, `./src/*` to package.json exports.
2. **metro-cache** — adds `./src/stores/*`, `./src/*` exports.
3. **metro-runtime** — adds explicit named exports for `polyfills/require`, `modules/asyncRequire`, `modules/HMRClient`, `modules/empty-module`, `modules/null-module`. No wildcard (wildcard causes double `.js.js`).
4. **metro-transform-worker** — adds `./src/utils/getMinifier` and `./src/*` exports.
5. **All other metro-* packages** — safe `./src/*` wildcard.
6. **metro/src/DeltaBundler/Serializers/sourceMapString.js** — adds `exports.default = exports.sourceMapString`.
7. **metro/src/ModuleGraph/worker/JsFileWrapping.js** — adds `exports.default = { wrapModule, wrapPolyfill, wrapJson, jsonToCommonJS, WRAP_NAME }`.
8. **metro-cache-key/src/index.js** — adds `exports.default = exports.getCacheKey`.
9. **metro-file-map/src/index.js** — fixes `eventsQueue` in `emitChange`. `changesWithMetadata` is `{ addedFiles, modifiedFiles, removedFiles, addedDirectories, removedDirectories }` (each iterable of `[path, metadata]` pairs). The `@expo/cli` listener expects `eventsQueue` to be an array of `{ filePath, metadata: { type } }` objects. Flatten using IIFE.
10. **@expo/cli/build/src/start/server/metro/instantiateMetro.js** — patched in-place (not in patch script): `LogRespectingTerminal` uses `this.log()` instead of `this._logLines.push()` (private field mismatch).

**How to apply:** On fresh install, run `node apps/client/scripts/patch-metro.js`. This is wired as a postinstall script in `apps/client/package.json`.
