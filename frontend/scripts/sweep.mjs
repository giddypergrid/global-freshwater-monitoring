/**
 * Loads every catchment by deep link and checks it actually draws.
 * Usage: node scripts/sweep.mjs [outDir]
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? null;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const index = JSON.parse(readFileSync("public/data/index.json", "utf8"));

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

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const failures = [];
for (const c of index.catchments) {
  await page.goto(`${BASE}/tool?catchment=${c.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("() => document.querySelectorAll('canvas').length > 0", null, {
    timeout: 25000,
  });
  await page.waitForTimeout(3200);

  const px = await page.evaluate(countBlue);
  const field = await page.getByPlaceholder("Search any country or catchment").inputValue();
  const countryField = await page.locator('[data-slot="select-trigger"]').first().innerText();

  const bad = [];
  if (!(px > 0)) bad.push(`nothing drawn (${px}px)`);
  if (field !== c.name) bad.push(`field "${field}" != "${c.name}"`);
  if (!countryField.includes(c.country)) bad.push(`country "${countryField.trim()}" != "${c.country}"`);

  console.log(
    `${bad.length ? "FAIL" : "ok  "} ${c.id.padEnd(15)} ${String(px).padStart(6)}px  ${c.reachCount} reaches` +
      (bad.length ? `  <- ${bad.join("; ")}` : ""),
  );
  if (bad.length) {
    failures.push(`${c.id}: ${bad.join("; ")}`);
    if (OUT) await page.screenshot({ path: `${OUT}/fail_${c.id}.png` });
  }
}

console.log(`\n${index.catchments.length - failures.length}/${index.catchments.length} catchments OK`);
if (failures.length) console.log("failures:\n" + failures.join("\n"));
console.log("console errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
