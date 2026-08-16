import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const entries = [
  ["cjs", "sizes/tree-shaking/entry-cjs.js"],
  ["esm", "sizes/tree-shaking/entry-esm.js"],
];

console.log("entry\traw_bytes");
for (const [name, entryPoint] of entries) {
  const result = await build({
    entryPoints: [resolve(projectRoot, entryPoint)],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    write: false,
  });
  const output = result.outputFiles[0].text;
  console.log(`${name}\t${Buffer.byteLength(output)}`);
}
