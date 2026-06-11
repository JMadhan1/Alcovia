---
name: Metro ESM/CJS resolver fix
description: Why @babel/runtime helpers resolve to ESM and how to fix it in metro.config.js
---

## Rule
In `apps/client/metro.config.js`, always override `unstable_conditionNames` to `['require', 'default']`.

**Why:** expo's `getDefaultConfig` sets `unstable_conditionNames: ['require', 'import']`. The `'import'` condition causes `@babel/runtime/helpers/*` (e.g. `interopRequireDefault`) to resolve to `helpers/esm/*.js` instead of the CJS counterpart. The CJS version sets `module.exports = fn; module.exports.__esModule = true; module.exports.default = module.exports`. The ESM version sets `exports.default = fn` — so `require()` returns `{ __esModule: true, default: fn }`. When module code does `var _interopRequireDefault = require(...)` and then calls `_interopRequireDefault(...)`, it gets "is not a function" because it got the object, not the function.

**How to apply:** In metro.config.js:
```js
const config = getDefaultConfig(__dirname);
config.resolver.unstable_conditionNames = ['require', 'default'];
module.exports = config;
```

Confirmed fixed: bundle at line ~2483 no longer triggers TypeError.
