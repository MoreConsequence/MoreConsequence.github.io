import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 编译产物不入库
    "experiments/**/*.js",
    // 实验代码：常含故意未使用的演示变量
    "experiments/**/*.ts",
    // 演示 CJS/ESM 双包语义的故意 require/import 用例
    "experiments/**/*.cjs",
    "experiments/**/*.mjs",
  ]),
]);

export default eslintConfig;
