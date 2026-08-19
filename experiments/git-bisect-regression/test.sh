#!/usr/bin/env bash
# 返回 0 = 好(add 正确), 非 0 = 坏(回归)
# 关键: 不依赖 require/模块解析(package.json untracked 亦不依赖), 直接 eval 源码
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/repo"
node -e '
const fs = require("fs");
const module = { exports: {} };
new Function("module", "exports",
  fs.readFileSync(process.argv[1], "utf8"))(module, module.exports);
const add = module.exports.add;
if (typeof add !== "function" || add(2, 3) !== 5) process.exit(1);
' "$(pwd)/calc.js"
