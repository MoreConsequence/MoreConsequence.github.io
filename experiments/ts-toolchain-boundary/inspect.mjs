import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const topLevelEntries = readdirSync("node_modules").filter((entry) => !entry.startsWith("."));

function version(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

console.log(`node=${process.version}`);
console.log(`npm=${version("npm", ["--version"])}`);
console.log(`typescript=${version("node_modules/.bin/tsc", ["--version"])}`);
console.log(`esbuild=${version("node_modules/.bin/esbuild", ["--version"])}`);
console.log(`zod_declared=${packageJson.dependencies.zod}`);
console.log(`zod_locked=${lockfile.packages["node_modules/zod"].version}`);
console.log(`direct_dependencies=${Object.keys(packageJson.dependencies).length}`);
console.log(`dev_dependencies=${Object.keys(packageJson.devDependencies).length}`);
console.log(`node_modules_top_level_entries=${topLevelEntries.length}`);
console.log("typecheck_command=node node_modules/typescript/bin/tsc --noEmit");
console.log("transpile_command=node_modules/.bin/esbuild components/post/article-body.tsx --loader:.tsx=tsx --outfile=/tmp/article-body.js");
