import { spawn } from "node:child_process";
import fs from "node:fs";

const [,, url, outputPath, selectorOrY] = process.argv;

if (!url || !outputPath) {
  console.log("Usage: node scripts/capture-screenshot.mjs <url> <outputPath> [selectorOrY]");
  process.exit(1);
}

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless",
  "--remote-debugging-port=9222",
  "--disable-gpu",
  "--window-size=1280,1000",
  `--user-data-dir=/tmp/chrome-screenshot-${Date.now()}`,
  "about:blank"
]);

let tabs;
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch("http://127.0.0.1:9222/json");
    if (res.ok) {
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    }
  } catch {
    // wait and retry
  }
  await new Promise(r => setTimeout(r, 200));
}

if (!tabs) {
  console.error("Failed to connect to Chrome after retries");
  chrome.kill();
  process.exit(1);
}

const pageTab = tabs.find(t => t.type === "page") || tabs[0];
const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener("message", handler);
        resolve(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("DOM.enable");
await send("Page.navigate", { url });
await new Promise(r => setTimeout(r, 2000));

if (selectorOrY) {
  const isNumber = !isNaN(Number(selectorOrY));
  if (isNumber) {
    await send("Runtime.evaluate", {
      expression: `window.scrollTo(0, ${selectorOrY})`
    });
  } else {
    await send("Runtime.evaluate", {
      expression: `
        const el = document.querySelector("${selectorOrY}");
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      `
    });
  }
  await new Promise(r => setTimeout(r, 500));
}

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(outputPath, Buffer.from(shot.data, "base64"));
console.log(`Saved screenshot to ${outputPath} (${shot.data.length} chars base64)`);

ws.close();
chrome.kill();
