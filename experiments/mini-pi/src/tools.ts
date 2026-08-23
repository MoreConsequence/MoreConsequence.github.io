import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Tool } from "./types.js";

export function createBuiltinTools(workingDir: string): Tool[] {
  return [
    {
      name: "read",
      description: "Read the content of a file or list directory contents.",
      parameters: { path: { type: "string", description: "Relative file or directory path" } },
      execute: async ({ path: targetPath }) => {
        const full = path.resolve(workingDir, String(targetPath));
        if (!fs.existsSync(full)) {
          throw new Error(`Path does not exist: ${targetPath}`);
        }
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          return fs.readdirSync(full).join("\n");
        }
        return fs.readFileSync(full, "utf-8");
      },
    },
    {
      name: "write",
      description: "Write content to a file (creates parent directories if needed).",
      parameters: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Full text content to write" },
      },
      execute: async ({ path: targetPath, content }) => {
        const full = path.resolve(workingDir, String(targetPath));
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, String(content), "utf-8");
        return `Successfully wrote ${Buffer.byteLength(String(content))} bytes to ${targetPath}.`;
      },
    },
    {
      name: "edit",
      description: "Replace exact target lines in a file with new replacement content.",
      parameters: {
        path: { type: "string", description: "Relative file path" },
        targetContent: { type: "string", description: "Exact lines of code to replace" },
        replacementContent: { type: "string", description: "New lines of code" },
      },
      execute: async ({ path: targetPath, targetContent, replacementContent }) => {
        const full = path.resolve(workingDir, String(targetPath));
        if (!fs.existsSync(full)) {
          throw new Error(`File does not exist: ${targetPath}`);
        }
        const original = fs.readFileSync(full, "utf-8");
        const target = String(targetContent);
        const repl = String(replacementContent);

        if (!original.includes(target)) {
          const normOrig = original.replace(/\r\n/g, "\n");
          const normTarget = target.replace(/\r\n/g, "\n");
          if (!normOrig.includes(normTarget)) {
            throw new Error(`Target lines not found in ${targetPath}. Please inspect the file first.`);
          }
          const updated = normOrig.replace(normTarget, repl);
          fs.writeFileSync(full, updated, "utf-8");
          return `Successfully edited ${targetPath}.`;
        }

        const updated = original.replace(target, repl);
        fs.writeFileSync(full, updated, "utf-8");
        return `Successfully edited ${targetPath}.`;
      },
    },
    {
      name: "bash",
      description: "Execute a shell command with a 50KB output buffer limit.",
      parameters: { command: { type: "string", description: "Shell command to run" } },
      execute: async ({ command }) => {
        return new Promise((resolve) => {
          const cp = spawn("bash", ["-c", String(command)], {
            cwd: workingDir,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let output = "";
          cp.stdout?.on("data", (d) => (output += d.toString()));
          cp.stderr?.on("data", (d) => (output += d.toString()));

          cp.on("close", (code) => {
            const trimmed = output.slice(-50000);
            resolve(`[Exit Code ${code}]\n${trimmed || "(No output)"}`);
          });
        });
      },
    },
  ];
}
