// 配置热加载：读解析全成功才原子替换，坏文件保持旧版，风暴写入无半截读。
// 只用内置 fs。运行：node reload.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
const file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify({ version: 1 }));

class ConfigManager {
  constructor() {
    this.current = this.load();
    this.errors = 0;
  }
  load() {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  poll() {
    try {
      const next = this.load(); // 全量解析成功才换引用
      this.current = next;
      return true;
    } catch {
      this.errors++;
      return false;
    }
  }
  get() {
    return this.current;
  }
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

const mgr = new ConfigManager();
// R1：v1 生效。
check("R1 初始 v1", mgr.get().version === 1);

// R2：写 v2 → poll 后生效。
fs.writeFileSync(file, JSON.stringify({ version: 2 }));
check("R2 热加载到 v2", mgr.poll() === true && mgr.get().version === 2);

// R3：写坏文件 → poll 失败但继续服务 v2。
fs.writeFileSync(file, "{broken");
check("R3 坏文件保持旧版", mgr.poll() === false && mgr.get().version === 2 && mgr.errors === 1);

// R4：50 次交替写好/坏，读到的永远是合法版本（无半截）。
let ok = true;
for (let i = 0; i < 50; i++) {
  fs.writeFileSync(file, i % 2 ? "{bad" : JSON.stringify({ version: 100 + i }));
  mgr.poll();
  const v = mgr.get().version;
  if (typeof v !== "number" || (v !== 2 && (v < 100 || v > 148))) ok = false;
}
check("R4 风暴写入无半截读", ok, `final=${mgr.get().version} errors=${mgr.errors}`);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
