import { build } from "esbuild";
import { brotliCompressSync, gzipSync } from "node:zlib";

const entries = [
  ["manual", "sizes/manual-only.ts"],
  ["zod-root", "sizes/zod-only.ts"],
  ["zod-v4", "sizes/zod-v4.ts"],
];

const bytes = (value) => ({
  raw: value.length,
  gzip: gzipSync(value, { level: 9 }).length,
  brotli: brotliCompressSync(value).length,
});

console.log("entry\traw\tgzip\tbrotli\tmetafile_inputs");
for (const [name, entryPoint] of entries) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    write: false,
    metafile: true,
  });
  const size = bytes(result.outputFiles[0].contents);
  console.log(`${name}\t${size.raw}\t${size.gzip}\t${size.brotli}\t${Object.keys(result.metafile.inputs).length}`);
}
