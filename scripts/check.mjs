// Quick health checks for the Granola Kid Finance app.
// Run locally with:  node scripts/check.mjs
// GitHub Actions runs this on every push and pull request.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import vm from "node:vm";

const errors = [];
const fail = msg => errors.push(msg);
const read = f => readFileSync(f, "utf8");

const pages = ["index.html", "create-order.html"];

// 1. Every inline <script> must be valid JavaScript (catches typos before they go live).
for (const page of pages) {
  const html = read(page);
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  if (!scripts.length) fail(`${page}: no inline scripts found`);
  scripts.forEach((code, i) => {
    try { new vm.Script(code, { filename: `${page}#script${i + 1}` }); }
    catch (err) { fail(`${page} script ${i + 1}: ${err.message}`); }
  });
}

// 1b. No function defined twice in the same page (the second silently replaces the first).
for (const page of pages) {
  const names = [...read(page).matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(m => m[1]);
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) fail(`${page}: functions defined more than once: ${dupes.join(", ")}`);
}

// 1c. Backend: valid JavaScript, and the PIN must never be committed.
const backend = "backend/Code.gs";
if (existsSync(backend)) {
  const gs = read(backend);
  try { new vm.Script(gs, { filename: backend }); } catch (err) { fail(`${backend}: ${err.message}`); }
  if (/(PIN|pin)\s*[=:]\s*["']\d{4,}["']/.test(gs)) fail(`${backend}: looks like a PIN is written in the code — keep it in Script Properties`);
}

// 2. Version numbers must agree between the two pages.
const index = read("index.html");
const order = read("create-order.html");
const appVersion = index.match(/const APP_VERSION = "(v[\d.]+)"/)?.[1];
const orderVersionInIndex = index.match(/const ORDER_VERSION = "(v[\d.]+)"/)?.[1];
const orderFooter = order.match(/Made by Granola Kid · (v[\d.]+)/)?.[1];
if (!appVersion) fail("index.html: APP_VERSION constant not found");
if (!orderVersionInIndex) fail("index.html: ORDER_VERSION constant not found");
if (orderVersionInIndex && orderFooter && orderVersionInIndex !== orderFooter) {
  fail(`Version mismatch: index.html says production is ${orderVersionInIndex}, create-order.html footer says ${orderFooter}`);
}

// 3. Both pages must point at the same backend.
const api = html => html.match(/const API = "([^"]+)"/)?.[1];
if (api(index) !== api(order)) fail("index.html and create-order.html use different API URLs");

// 4. manifest.json is valid and its icons exist.
try {
  const manifest = JSON.parse(read("manifest.json"));
  for (const icon of manifest.icons || []) {
    if (!existsSync(icon.src)) fail(`manifest.json: icon ${icon.src} is missing`);
  }
} catch (err) { fail(`manifest.json: ${err.message}`); }

// 5. Fonts and local files referenced by the pages exist, and images stay small for phones.
for (const page of pages) {
  for (const [, ref] of read(page).matchAll(/(?:src|href)="([^"#:]+\.(?:png|jpg|jpeg|svg|json|html))"/gi)) {
    if (!existsSync(ref)) fail(`${page}: links to missing file ${ref}`);
  }
}
const MAX_IMAGE_KB = 300;
for (const img of readdirSync(".").filter(f => /\.(png|jpe?g)$/i.test(f))) {
  if (existsSync(img)) {
    const kb = Math.round(statSync(img).size / 1024);
    if (kb > MAX_IMAGE_KB) fail(`${img} is ${kb} KB (limit ${MAX_IMAGE_KB} KB) — compress it before uploading`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) found:\n` + errors.map(e => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ All checks passed (Finance ${appVersion}, Production ${orderVersionInIndex})`);
