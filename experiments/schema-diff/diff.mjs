// schema breaking-change 检测：改名、收窄标 breaking，加可选放行。
// 只用内置。运行：node diff.mjs
const v1 = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    age: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
  },
};

function diff(oldS, newS) {
  const breaking = [];
  const op = oldS.properties || {};
  const np = newS.properties || {};
  for (const k of Object.keys(op)) {
    if (!(k in np)) {
      breaking.push(`removed:${k}`);
      continue;
    }
    const o = op[k];
    const n = np[k];
    if (o.type !== n.type) breaking.push(`retyped:${k}:${o.type}->${n.type}`);
    if (o.enum && !n.enum) { /* 放宽：安全 */ }
    if (!o.enum && n.enum) breaking.push(`narrowed:${k}:open->enum[${n.enum}]`);
    if ((oldS.required || []).includes(k) && !(newS.required || []).includes(k)) {
      /* required 变可选：读侧兼容，不标 */
    }
  }
  return breaking;
}

let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// B1：改名 age→years = 一删一加，删标 breaking。
const renamed = structuredClone(v1);
delete renamed.properties.age;
renamed.properties.years = { type: "number" };
const b1 = diff(v1, renamed);
check("B1 改名检出 removed", b1.includes("removed:age") && b1.includes("removed:years") === false, JSON.stringify(b1));

// B2：string 收窄成 enum 标 breaking（老值可能不在枚举里）。
const narrowed = structuredClone(v1);
narrowed.properties.name = { type: "string", enum: ["a", "b"] };
const b2 = diff(v1, narrowed);
check("B2 收窄检出 narrowed", b2.some((s) => s.startsWith("narrowed:name")), JSON.stringify(b2));

// B3：加可选字段放行。
const added = structuredClone(v1);
added.properties.nick = { type: "string" };
check("B3 加可选放行", diff(v1, added).length === 0);

// B4：required 变可选放行（读侧兼容）。
const relaxed = structuredClone(v1);
relaxed.required = [];
check("B4 去 required 放行", diff(v1, relaxed).length === 0);

// B5：改类型标 breaking。
const retyped = structuredClone(v1);
retyped.properties.age = { type: "string" };
check("B5 改类型检出 retyped", diff(v1, retyped).some((s) => s.startsWith("retyped:age")), JSON.stringify(diff(v1, retyped)));

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
