/**
 * Map hit-testing and view motion.
 *
 * Catchments are tiny — 1,177 of them cover 2.55% of the world and the median one is under
 * 3 px across at world zoom — so the map snaps to the nearest target and highlights it.
 * This asserts that a click never lands nowhere, that the highlight paints, and that the
 * view flies rather than jumps.
 */
import { chromium } from "playwright";
import { screenPointFor, isOnScreen } from "./lib/mappx.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
/** A point 0.46 deg inside catchment 2060020620 (France, 335 site records). */
const FRANCE = { lng: 1.3642, lat: 45.1129, id: "2060020620" };

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const badRequests = new Map();
const pageErrors = [];
page.on("response", (r) => r.status() >= 400 && badRequests.set(r.url(), r.status()));
page.on("pageerror", (e) => pageErrors.push(String(e)));

const catchBox = () =>
  page.locator('input[placeholder="Search by id or region"]').inputValue();
const regionBox = () => page.locator('button[role="combobox"]').first().textContent();
const tipText = () =>
  page.locator(".leaflet-tooltip").first().textContent().catch(() => null);
const cursorAt = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? getComputedStyle(el).cursor : "none";
    },
    [x, y],
  );

/** HOVER is #64748b at 0.35 alpha; the canvas has no DOM node to query, so read pixels. */
const hoverPixels = () =>
  page.evaluate(() => {
    const canvas = document.querySelector(".leaflet-overlay-pane canvas");
    if (!canvas) return -1;
    const d = canvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 100) < 8 && Math.abs(d[i + 1] - 116) < 8 && d[i + 3] > 60) n++;
    }
    return n;
  });

async function load(query) {
  await page.goto(`${BASE}/tool${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-tile-loaded", { timeout: 30000 });
  await page.waitForTimeout(5000);
}

console.log("1. no region chosen — the map is a region picker, nowhere is dead");
await load("");
for (const [name, lng, lat] of [
  ["empty land (Kansas)", -98, 39],
  ["desert (Sahara)", 15, 22],
  ["open ocean (Pacific)", -140, 5],
]) {
  const t = await screenPointFor(page, lng, lat);
  if (!(await isOnScreen(page, t))) {
    check(`${name} reachable`, false, "target off-screen, probe invalid");
    continue;
  }
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(400);
  const tip = await tipText();
  check(
    `${name} offers a region`,
    (await cursorAt(t.x, t.y)) === "pointer" && /click to zoom in/.test(tip ?? ""),
    JSON.stringify(tip),
  );
}
const kansas = await screenPointFor(page, -98, 39);
await page.mouse.click(kansas.x, kansas.y);
await page.waitForTimeout(2500);
check(
  "clicking empty land selects its region",
  (await regionBox())?.includes("North America"),
  JSON.stringify(await regionBox()),
);

console.log("\n2. region open — near-misses snap, and the target highlights");
await load("?region=Europe");
const france = await screenPointFor(page, FRANCE.lng, FRANCE.lat);
check("France target on screen", await isOnScreen(page, france), `zoom ${france?.zoom}`);

const box = await page.locator(".leaflet-container").boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await page.waitForTimeout(500);
const baseline = await hoverPixels();

for (const offset of [0, -40, -110]) {
  const x = france.x + Math.abs(offset);
  const y = france.y + offset;
  if (!(await isOnScreen(page, { x, y }))) {
    check(`miss by ${offset}px`, false, "target off-screen, probe invalid");
    continue;
  }
  await page.mouse.move(x, y);
  await page.waitForTimeout(500);
  const painted = await hoverPixels();
  const tip = await tipText();
  const away = Math.round(Math.hypot(Math.abs(offset), Math.abs(offset)));
  check(
    `miss by ${away}px still names a catchment`,
    (await cursorAt(x, y)) === "pointer" && /site records/.test(tip ?? ""),
    JSON.stringify(tip),
  );
  check(`miss by ${away}px highlights it`, painted > baseline, `${baseline} -> ${painted}`);
}

console.log("\n3. the view flies rather than jumps");
const start = await screenPointFor(page, FRANCE.lng, FRANCE.lat);
await page.mouse.click(start.x, start.y);
const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(100);
  const p = await screenPointFor(page, FRANCE.lng, FRANCE.lat);
  if (p) samples.push(p);
}
let moved = 0;
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1];
  const b = samples[i];
  if (Math.hypot(a.x - b.x, a.y - b.y) > 2 || a.zoom !== b.zoom) moved += 1;
}
check("view animates across several frames", moved >= 3, `${moved} moving frames`);
check("the click selected the catchment", (await catchBox()) === FRANCE.id, await catchBox());

console.log("\n4. clean network and console");
check("no failing requests", badRequests.size === 0, [...badRequests].slice(0, 3).map(([u, s]) => `${s} ${u}`).join(" | "));
check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await page.screenshot({ path: "screenshots/audit_map.png" });
await browser.close();
console.log(`\n${failures.length ? `FAILED: ${failures.join(", ")}` : "all map checks passed"}`);
process.exit(failures.length ? 1 : 0);
