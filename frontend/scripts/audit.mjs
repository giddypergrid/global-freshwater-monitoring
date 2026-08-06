/**
 * UI/UX audit: opens menus, exercises search, and captures three viewport widths.
 * Usage: node scripts/audit.mjs <outDir>
 */
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "screenshots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HAS_CANVAS = "() => document.querySelectorAll('canvas').length > 0";

const browser = await chromium.launch({ channel: "msedge" });
const issues = [];

async function page(width, height) {
  const p = await browser.newPage({ viewport: { width, height } });
  p.on("pageerror", (e) => issues.push(`[${width}px] pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && issues.push(`[${width}px] ${m.text()}`));
  return p;
}

// --- 1. dropdown must open BELOW the trigger, not on top of it -----------------
const desktop = await page(1600, 1000);
await desktop.goto(`${BASE}/tool?catchment=waikato`, { waitUntil: "domcontentloaded" });
await desktop.waitForFunction(HAS_CANVAS, null, { timeout: 20000 });
await desktop.waitForTimeout(2500);

const trigger = desktop.locator('[data-slot="select-trigger"]').nth(1); // indicator
await trigger.click();
await desktop.waitForTimeout(600);
await desktop.screenshot({ path: `${OUT}/a1_dropdown.png` });

const tBox = await trigger.boundingBox();
const pBox = await desktop.locator('[data-slot="select-content"]').boundingBox();
if (pBox && tBox) {
  const overlaps = pBox.y < tBox.y + tBox.height - 2;
  console.log(
    `dropdown: trigger.bottom=${(tBox.y + tBox.height).toFixed(0)} popup.top=${pBox.y.toFixed(0)} -> ${overlaps ? "OVERLAPS TRIGGER" : "opens below OK"}`,
  );
  console.log(`dropdown width=${pBox.width.toFixed(0)} trigger width=${tBox.width.toFixed(0)}`);
  if (overlaps) issues.push("indicator dropdown overlaps its trigger");
}
await desktop.keyboard.press("Escape");
await desktop.waitForTimeout(400);

// --- 2. the combobox reflects the current selection ---------------------------
const search = desktop.getByPlaceholder("Search any country or catchment");
const deepLinked = await search.inputValue();
console.log(`deep-linked ?catchment=waikato -> field reads "${deepLinked}"`);
if (deepLinked !== "Waikato") issues.push(`field should read "Waikato", reads "${deepLinked}"`);

// focus opens the full list for the current country, not just the match
await search.click();
await desktop.waitForTimeout(500);
const openRows = await desktop.locator("aside li button").allInnerTexts();
console.log(`focus -> ${openRows.length} rows (should list all NZ catchments, not just 1)`);
if (openRows.length < 2) issues.push("focusing the field collapsed the list to the selection");
await desktop.screenshot({ path: `${OUT}/a2_combobox_open.png` });

// typing re-filters across every country
await search.fill("germ");
await desktop.waitForTimeout(500);
const rows = await desktop.locator("aside li button").allInnerTexts();
console.log(`type "germ" -> `, rows.map((r) => r.split("\n")[0]).join(", "));
if (rows.length === 0) issues.push('searching "germ" returned no catchments');
await desktop.screenshot({ path: `${OUT}/a2b_search_country.png` });

// picking a foreign catchment switches country AND fills the field
await desktop.locator("aside li button").first().click();
await desktop.waitForTimeout(2500);
const countryNow = await desktop.locator('[data-slot="select-trigger"]').first().innerText();
const fieldNow = await search.inputValue();
console.log(`after pick -> country "${countryNow.trim()}", field "${fieldNow}"`);
if (!countryNow.includes("Germany")) issues.push("country did not follow cross-country pick");
if (fieldNow !== "Danube") issues.push(`field should show the picked catchment, reads "${fieldNow}"`);
const listGone = (await desktop.locator("aside li button").count()) === 0;
if (!listGone) issues.push("list stayed open after picking");
console.log(`list closed after pick -> ${listGone ? "yes" : "NO (bad)"}`);
await desktop.screenshot({ path: `${OUT}/a3_cross_country.png` });
await desktop.close();

// --- 3. responsive widths ------------------------------------------------------
for (const [w, h, name] of [
  [1280, 900, "a4_laptop"],
  [900, 700, "a4b_small_laptop"],
  [834, 1000, "a5_tablet"],
  [390, 844, "a6_phone"],
]) {
  const p = await page(w, h);
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(HAS_CANVAS, null, { timeout: 20000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${name}.png` });

  const mapBox = await p.locator(".leaflet-container").boundingBox();
  console.log(`${w}px: map ${mapBox?.width.toFixed(0)}x${mapBox?.height.toFixed(0)}`);
  if (mapBox && mapBox.width < 200) issues.push(`map only ${mapBox.width.toFixed(0)}px wide at ${w}px`);

  const scrollX = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (scrollX) issues.push(`horizontal page scroll at ${w}px`);
  console.log(`${w}px: horizontal scroll -> ${scrollX ? "YES (bad)" : "no"}`);
  await p.close();
}

// --- 4. no stale reaches while the next catchment downloads --------------------
// Counts blue pixels on the vector canvas: >0 means river reaches are drawn.
/**
 * Reach/site pixels only. Catchment fills are translucent (alpha ~46) and only weakly
 * blue, so requiring near-opaque + strongly blue excludes them; reach strokes are
 * opacity 1 in the power palette (#60a5fa / #2563eb / #1e3a8a).
 */
function countBlue() {
  const c = document.querySelector(".leaflet-container canvas");
  if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200 && d[i + 2] > d[i] + 60) n++;
  }
  return n;
}

/** Fails loudly rather than returning undefined and silently passing the checks. */
async function bluePixels(p, label) {
  const n = await p.evaluate(countBlue);
  if (typeof n !== "number" || n < 0) {
    issues.push(`could not read canvas pixels (${label}): got ${n}`);
    return NaN;
  }
  return n;
}

const slow = await page(1200, 800);
await slow.goto(`${BASE}/tool?catchment=manawatu`, { waitUntil: "domcontentloaded" });
await slow.waitForFunction(HAS_CANVAS, null, { timeout: 20000 });
await slow.waitForTimeout(4000);
const before = await bluePixels(slow, "manawatu");
console.log(`\nManawatu drawn: ${before} blue px`);
if (!(before > 0)) issues.push("no reaches drawn for Manawatu");

// hold the next catchment file for 3s, then click a different catchment
await slow.route("**/data/catchments/whanganui.json", async (route) => {
  await new Promise((r) => setTimeout(r, 3000));
  await route.continue();
});
await slow.getByPlaceholder("Search any country or catchment").click();
await slow.waitForTimeout(300);
await slow.getByRole("button", { name: /^Whanganui/ }).first().click();
await slow.waitForTimeout(1200); // mid-download
const during = await bluePixels(slow, "mid-load");
await slow.screenshot({ path: `${OUT}/a7_midload.png` });
console.log(`during load:    ${during} blue px (must be 0 — old catchment must be gone)`);
if (!(during === 0)) issues.push(`stale reaches during load: ${during} blue px still drawn`);

await slow.waitForTimeout(4000);
const after = await bluePixels(slow, "whanganui");
console.log(`Whanganui drawn: ${after} blue px`);
if (!(after > 0)) issues.push("reaches never appeared after load");
await slow.close();

// --- 5. clicking faster than any animation must still land framed ---------------
function drawnBox() {
  const c = document.querySelector(".leaflet-container canvas");
  if (!c) return null;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200 && d[i + 2] > d[i] + 60) {
      n++;
      const p = i / 4, x = p % c.width, y = (p / c.width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { n, minX, maxX, minY, maxY, w: c.width, h: c.height };
}

const fast = await page(1400, 900);
await fast.goto(`${BASE}/tool?catchment=waikato`, { waitUntil: "domcontentloaded" });
await fast.waitForFunction(HAS_CANVAS, null, { timeout: 20000 });
await fast.waitForTimeout(3500);

const order = ["Clutha", "Waitaki", "Whanganui", "Rangitikei", "Manawatu", "Wairau"];
for (const name of order) {
  await fast.getByPlaceholder("Search any country or catchment").click();
  await fast.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  // deliberately no settle wait — this is the rapid-click case
}
const finalName = order[order.length - 1];
await fast.waitForTimeout(5000);

const field = await fast.getByPlaceholder("Search any country or catchment").inputValue();
const box = await fast.evaluate(drawnBox);
await fast.screenshot({ path: `${OUT}/a8_rapid.png` });

console.log(`\nrapid clicks -> field "${field}" (expect ${finalName})`);
if (field !== finalName) issues.push(`rapid clicking left field "${field}", expected ${finalName}`);

if (!box || box.n === 0) {
  issues.push("rapid clicking left nothing drawn");
} else {
  const m = Math.min(box.minX, box.minY, box.w - box.maxX, box.h - box.maxY);
  console.log(
    `drawn ${box.minX},${box.minY} -> ${box.maxX},${box.maxY} in ${box.w}x${box.h}; edge margin ${m}px`,
  );
  if (m < 3) issues.push(`view clipped after rapid clicks (edge margin ${m}px)`);
}
await fast.close();

console.log("\n=== issues ===");
console.log(issues.length ? issues.join("\n") : "none");
await browser.close();
