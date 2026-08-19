// 双包陷阱: 同一包在 ESM/CJS 两条路径各加载一份, 实例不同步
import pkg from "dual-pkg";       // ESM default import → CJS module.exports
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cjs = require("dual-pkg");  // CJS require → 同样模块, 但缓存键不同
console.log("ESM default kind:", pkg.kind, "| CJS require kind:", cjs.kind);
console.log("同一实例?", pkg === cjs ? "是" : "否 (双包陷阱: 两份状态)");
