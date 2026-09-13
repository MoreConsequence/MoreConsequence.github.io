// 被测脚本：尝试 5 类操作，逐行打印结果。由 run.sh 分别以无 flag / 受限 flag 启动。
// 注意：CommonJS（require），与 ESM 权限行为一致，图省事。
const fs = require("node:fs");
const cp = require("node:child_process");
const os = require("node:os");

function t(name, fn) {
  try {
    const v = fn();
    console.log(`${name}: OK${v !== undefined ? ` ${v}` : ""}`);
  } catch (e) {
    console.log(`${name}: DENIED ${e.code || "?"}`);
  }
}

t("READ-ALLOW", () => JSON.stringify(fs.readFileSync("/tmp/perm-allowed.txt", "utf8").trim()));
t("READ-ETC", () => fs.readFileSync("/etc/hosts", "utf8").length);
t("WRITE-ALLOW", () => { fs.writeFileSync("/tmp/perm-w.txt", "x"); return "written"; });
t("WRITE-ETC", () => fs.writeFileSync("/etc/perm-w", "x"));
t("SPAWN", () => cp.execSync("echo hi").toString().trim());
t("OS-HOSTNAME", () => os.hostname());
