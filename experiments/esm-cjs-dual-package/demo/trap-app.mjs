// 双包陷阱: 同一进程内 import 拿到 ESM 实例, createRequire 拿到 CJS 实例
import { inc as esmInc, get as esmGet } from "dual-pkg";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cjs = require("dual-pkg");

esmInc(); esmInc();       // ESM 实例加 2
cjs.inc();                 // CJS 实例加 1
console.log("ESM 实例 state:", esmGet(), "| CJS 实例 state:", cjs.get());
console.log("两份实例, 状态互不可见:", esmGet() !== cjs.get() ? "是(双包陷阱)" : "否");
