/**
 * Saves PNG screenshots of the Tobago delivery screens from a LOCAL run
 * (scripts/local-bridge/server.mjs + `next dev -p 3100`, see server.mjs).
 * Uses the installed Chrome over the DevTools protocol — no extra packages.
 *
 *   node scripts/local-bridge/capture.mjs [outDir]   (default screenshots/tobago)
 *
 * Signs in with the fixture accounts in fixtures.mjs, on localhost only.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FIXTURE_PASSWORD } from "./fixtures.mjs";

const BASE = process.env.APP_URL_LOCAL || "http://localhost:3100";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("capture.mjs only runs against localhost");
const OUT = path.resolve(process.argv[2] || "screenshots/tobago");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(ac) {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: ac, password: FIXTURE_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${ac} failed: ${res.status}`);
  const c = res.headers.getSetCookie()[0];
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1) };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { ok, ko } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) ko(new Error(d.error.message));
      else ok(d.result);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((ok, ko) => {
      pending.set(++id, { ok, ko });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

async function shot(send, url, file, { selector, before }) {
  await send("Page.navigate", { url });
  // The client cards fetch after hydration (and dev mode compiles on first hit): wait for the element.
  const box = () =>
    send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => { const el = (${selector})(); if (!el) return null; const r = el.getBoundingClientRect();
        return { x: r.x + scrollX - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16 }; })()`,
    });
  let result = null;
  for (let i = 0; i < 60 && !result?.value; i++) {
    await sleep(500);
    ({ result } = await box());
  }
  if (!result?.value) throw new Error(`nothing to capture on ${url}`);
  if (before) {
    await send("Runtime.evaluate", { expression: before });
    await sleep(500);
    ({ result } = await box());
  }
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...result.value, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(data, "base64"));
  console.log("saved", path.join(OUT, file));
}

const cardSelector = `() => [...document.querySelectorAll('section')].find(s => s.textContent.includes('Consolidated Billing is on'))`;
const openTobagoFaq = `[...document.querySelectorAll('details')].forEach(d => { if (d.textContent.includes('Tobago')) d.open = true; })`;
const chargesSelector = `() => [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === 'Charges')?.closest('section, div.rounded-lg') ?? null`;

fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sb-capture-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  if (!target) throw new Error("Chrome did not start");
  const { ready, send, close } = cdp(target.webSocketDebuggerUrl);
  await ready;
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 2200, deviceScaleFactor: 2, mobile: true });

  const as = async (ac) => {
    await send("Network.clearBrowserCookies");
    const c = await login(ac);
    await send("Network.setCookie", { ...c, domain: new URL(BASE).hostname, path: "/" });
  };

  await as("9901");
  await shot(send, `${BASE}/dashboard/account`, "01-cb-card-tobago.png", { selector: cardSelector, before: openTobagoFaq });
  await shot(send, `${BASE}/dashboard/invoices/INV-900001`, "03-invoice-tobago.png", { selector: chargesSelector });
  await as("9902");
  await shot(send, `${BASE}/dashboard/account`, "02-cb-card-trinidad.png", { selector: cardSelector, before: openTobagoFaq });
  close();
} finally {
  chrome.kill();
}
