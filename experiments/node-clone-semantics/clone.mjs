// structuredClone 语义：隔离、函数拒收、类退化 plain、Date/循环保留。
// 只用内置。运行：node clone.mjs
let failures = 0;
const check = (name, cond, d = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${d ? ` | ${d}` : ""}`);
  if (!cond) failures++;
};

// C1：深隔离——改克隆体，原对象不动。
const src = { a: { list: [1, 2] }, s: "x" };
const c1 = structuredClone(src);
c1.a.list.push(3);
check("C1 深隔离", src.a.list.length === 2 && c1.a.list.length === 3);

// C2：函数值直接拒收（抛 DataCloneError），不是静默丢弃。
let threw = "";
try {
  structuredClone({ f: () => 1 });
} catch (e) {
  threw = e.name;
}
check("C2 函数拒收", threw === "DataCloneError", `threw=${threw}`);

// C3：类实例退化 plain 对象（原型丢失，字段保留）。
class User {
  constructor() { this.name = "u"; }
  greet() { return "hi"; }
}
const c3 = structuredClone(new User());
check("C3 类退化plain", !(c3 instanceof User) && c3.name === "u" && typeof c3.greet === "undefined");

// C4：Date/Map/循环保留可用。
const circ = { d: new Date("2026-01-01T00:00:00Z"), m: new Map([["k", 1]]) };
circ.self = circ;
const c4 = structuredClone(circ);
check(
  "C4 Date/Map/循环保留",
  c4.d instanceof Date && c4.d.getTime() === circ.d.getTime() &&
  c4.m instanceof Map && c4.m.get("k") === 1 && c4.self === c4,
);

// C5（加固）：transfer 转移所有权——原件被掏空（0 字节），克隆体接管。
const buf = new ArrayBuffer(8);
const c5 = structuredClone({ buf }, { transfer: [buf] });
check("C5 transfer 掏空原件", buf.byteLength === 0 && c5.buf.byteLength === 8,
  `orig=${buf.byteLength} clone=${c5.buf.byteLength}`);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
