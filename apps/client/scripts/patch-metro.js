const fs = require('fs');
const path = require('path');
const nm = path.join(__dirname, '../node_modules');

function patchExports(pkgDir, extraExports) {
  const pkgPath = path.join(nm, pkgDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (!pkg.exports) return;
  let changed = false;
  for (const [key, val] of Object.entries(extraExports)) {
    if (!pkg.exports[key]) { pkg.exports[key] = val; changed = true; }
  }
  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log('[patch] Patched exports:', pkgDir);
  }
}

function addDefaultExport(relPath, defaultValue) {
  const fullPath = path.join(nm, relPath);
  if (!fs.existsSync(fullPath)) { console.log('[patch] MISSING:', relPath); return; }
  let c = fs.readFileSync(fullPath, 'utf-8');
  if (c.includes('exports.default')) return;
  c += '\n' + defaultValue + '\n';
  fs.writeFileSync(fullPath, c);
  console.log('[patch] Added default export to:', relPath);
}

// ── 1. metro — needs DeltaBundler + lib + ModuleGraph paths ─────────────────
patchExports('metro', {
  './src/lib/TerminalReporter': './src/lib/TerminalReporter.js',
  './src/lib/*': './src/lib/*.js',
  './src/DeltaBundler/Serializers/sourceMapString': './src/DeltaBundler/Serializers/sourceMapString.js',
  './src/DeltaBundler/Serializers/*': './src/DeltaBundler/Serializers/*.js',
  './src/DeltaBundler/*': './src/DeltaBundler/*.js',
  './src/ModuleGraph/worker/*': './src/ModuleGraph/worker/*.js',
  './src/node-haste/*': './src/node-haste/*.js',
  './src/*': './src/*.js',
});

// ── 2. metro-cache ───────────────────────────────────────────────────────────
patchExports('metro-cache', {
  './src/stores/FileStore': './src/stores/FileStore.js',
  './src/stores/*': './src/stores/*.js',
  './src/*': './src/*.js',
});

// ── 3. metro-runtime — explicit paths only (no wildcard to avoid .js.js) ────
//    metro-config/defaults.js resolves:  metro-runtime/src/polyfills/require.js  (WITH .js)
//    metro-config/defaults/index.js has: metro-runtime/src/modules/asyncRequire   (no .js)
patchExports('metro-runtime', {
  './src/polyfills/require.js': './src/polyfills/require.js',
  './src/polyfills/require': './src/polyfills/require.js',
  './src/modules/asyncRequire': './src/modules/asyncRequire.js',
  './src/modules/asyncRequire.js': './src/modules/asyncRequire.js',
  './src/modules/HMRClient': './src/modules/HMRClient.js',
  './src/modules/HMRClient.js': './src/modules/HMRClient.js',
  './src/modules/empty-module': './src/modules/empty-module.js',
  './src/modules/empty-module.js': './src/modules/empty-module.js',
  './src/modules/null-module': './src/modules/null-module.js',
  './src/modules/null-module.js': './src/modules/null-module.js',
});

// ── 4. metro-transform-worker — needs src/utils/getMinifier ─────────────────
patchExports('metro-transform-worker', {
  './src/utils/getMinifier': './src/utils/getMinifier.js',
  './src/utils/getMinifier.js': './src/utils/getMinifier.js',
  './src/*': './src/*.js',
});

// ── 5. All other metro-* packages (safe wildcard) ───────────────────────────
const metroPkgs = fs.readdirSync(nm).filter(d =>
  d.startsWith('metro-') &&
  !['metro-cache', 'metro-runtime', 'metro-transform-worker'].includes(d)
);
for (const pkg of metroPkgs) {
  patchExports(pkg, { './src/*': './src/*.js' });
}

// ── 6. Fix missing default exports in metro source files ─────────────────────
// sourceMapString: has __esModule:true but no default; @expo/metro-config __importDefault
addDefaultExport(
  'metro/src/DeltaBundler/Serializers/sourceMapString.js',
  'exports.default = exports.sourceMapString;'
);

// JsFileWrapping: named exports only; @expo/metro-config calls .default.wrapModule etc.
addDefaultExport(
  'metro/src/ModuleGraph/worker/JsFileWrapping.js',
  'exports.default = { wrapModule: exports.wrapModule, wrapPolyfill: exports.wrapPolyfill, wrapJson: exports.wrapJson, jsonToCommonJS: exports.jsonToCommonJS, WRAP_NAME: exports.WRAP_NAME };'
);

// metro-cache-key: getCacheKey named export; @expo/metro-config calls default([...])
addDefaultExport(
  'metro-cache-key/src/index.js',
  'exports.default = exports.getCacheKey;'
);

// ── 7. Fix metro-file-map eventsQueue — must be array of {filePath,metadata} objects ──
// @expo/cli's waitForMetroToObserveTypeScriptFile does `for (const event of eventsQueue)`
// expecting {filePath, metadata} objects. changesWithMetadata from getMappedView() is an
// object with {addedFiles, modifiedFiles, removedFiles, addedDirectories, removedDirectories}
// where each is an iterable of [path, metadata] pairs — NOT a Map.
(function patchMetroFileMap() {
  const fmPath = path.join(nm, 'metro-file-map/src/index.js');
  if (!fs.existsSync(fmPath)) { console.log('[patch] MISSING: metro-file-map/src/index.js'); return; }
  let c = fs.readFileSync(fmPath, 'utf-8');
  if (c.includes('PATCHED_EVENTS_QUEUE')) return;
  const flatten = "eventsQueue: (function(cm){const q=[];for(const[fp,md]of cm.addedFiles||[])q.push({filePath:fp,metadata:{...md,type:'f'}});for(const[fp,md]of cm.modifiedFiles||[])q.push({filePath:fp,metadata:{...md,type:'f'}});for(const[fp,md]of cm.removedFiles||[])q.push({filePath:fp,metadata:{...md,type:'f'}});for(const[fp]of cm.addedDirectories||[])q.push({filePath:fp,metadata:{type:'d'}});for(const[fp]of cm.removedDirectories||[])q.push({filePath:fp,metadata:{type:'d'}});return q;})(changesWithMetadata), /* PATCHED_EVENTS_QUEUE */";
  c = c.replace(/eventsQueue: changesWithMetadata,/g, flatten);
  fs.writeFileSync(fmPath, c);
  console.log('[patch] Fixed metro-file-map eventsQueue format');
})();

console.log('[patch] All metro patches applied.');
