import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = spawnSync(process.execPath, [fileURLToPath(new URL("./unhandled.mjs", import.meta.url))], {
  encoding: "utf8",
});
const stderr = child.stderr ?? "";
const status = child.status ?? -1;
const timerRan = (child.stdout ?? "").includes("timer-ran");
const mentionsUnhandled = /unhandled|Error: unhandled demo/i.test(stderr);

console.log(`node=${process.version}`);
console.log(`child_status=${status}`);
console.log(`timer_ran=${timerRan}`);
console.log(`stderr_mentions_unhandled=${mentionsUnhandled}`);

if (status === 0 || timerRan || !mentionsUnhandled) {
  process.exit(1);
}
