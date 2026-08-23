/**
 * Checks the strict drill-down: region -> catchment -> site.
 * Usage: npm run dev in another shell, then `node scripts/drilldown.mjs`
 */
import { chromium } from "playwright";
import { targetPoint } from "./lib/mappx.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const region = () => page.locator("aside button[role='combobox']").first().innerText();
const url = () => new URL(page.url()).searchParams;
const state = async (label) =>
  console.log(
    `${label.padEnd(34)} region=${(await region()).trim().padEnd(14)} ` +
      `catchment=${url().get("catchment") ?? "none"}`,
  );

/** Clicks a real place, and says so rather than failing quietly if it is off-screen. */
async function clickAt(name, lng, lat) {
  const { point, visible } = await targetPoint(page, lng, lat);
  if (!visible) {
    console.log(`   ${name}: off-screen, not clicked`);
    return false;
  }
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(2200);
  return true;
}

await page.goto(`${BASE}/tool`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".leaflet-tile-loaded", { timeout: 30000 });
await page.waitForTimeout(5000);
await state("1. first load");

// Nothing is selected yet, so a click anywhere picks the region it landed nearest.
await clickAt("New Zealand", 172.5, -43.5);
await state("2. clicked a region");
await page.screenshot({ path: "screenshots/10_after_region_jump.png" });

// Now inside Oceania, clicking a monitored catchment must open it.
// Canterbury, Waikato and the Melbourne catchments all carry sites.
for (const [name, lng, lat] of [
  ["Canterbury", 172.0, -43.6],
  ["Waikato", 175.3, -37.8],
  ["Melbourne", 145.2, -37.7],
]) {
  if (!(await clickAt(name, lng, lat))) continue;
  if (url().get("catchment")) {
    console.log(`   catchment opened by clicking ${name}`);
    break;
  }
}
await state("3. clicked a catchment");
await page.screenshot({ path: "screenshots/11_catchment_open.png" });

const heading = await page.locator("aside h2").nth(2).innerText();
console.log(`4. panel section                   ${heading}`);

console.log("\npage errors:", errors.length ? errors : "none");
await browser.close();
