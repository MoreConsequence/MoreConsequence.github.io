import { readFileSync } from "node:fs";
import { get_encoding } from "tiktoken";
const enc = get_encoding("cl100k_base");
const text = readFileSync(process.argv[2], "utf8");
console.log("chars_total:", text.length);
console.log("tokens_total:", enc.encode(text).length);
// 去注释与空行后的"模板主体"口径
const body = text.split("\n").filter(l => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");
console.log("chars_body:", body.length);
console.log("tokens_body:", enc.encode(body).length);
