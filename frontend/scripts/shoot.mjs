/**
 * Screenshot the running app and report console errors.
 * Usage: npm run dev (in another shell), then `node scripts/shoot.mjs [outDir]`
 * Drives the installed Edge — no Playwright browser download needed.
 */
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "screenshots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HAS_CANVAS = "() => document.querySelectorAll('canvas').length > 0";

// A well-monitored catchment in the real data: 106 TN and 107 TP site records.
const CATCHMENT = "5060084180";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

async function shot(url, file, waitFor) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForFunction(waitFor, null, { timeout: 20000 });
  await page.waitForTimeout(4000); // let map tiles and the power slice settle
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log(`saved ${file}`);
}

async function panelText(label) {
  const text = await page
    .locator("aside")
    .innerText()
    .catch(() => "(panel not found)");
  console.log(`\n--- ${label} ---\n${text}`);
}

await shot("/tool", "01_world.png", HAS_CANVAS);
await panelText("world, TN monthly 20yr 30%");

await shot(`/tool?catchment=${CATCHMENT}`, "02_catchment.png", HAS_CANVAS);
await panelText(`catchment ${CATCHMENT}, TN monthly 20yr 30%`);

// A site inside the open catchment — the marker nearest the map centre.
await page.locator("path.leaflet-interactive, canvas").first().click({ position: { x: 700, y: 500 } });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03_site.png` });
console.log("saved 03_site.png");
await panelText("after clicking near a site");

// The weakest design must visibly drop the power figures.
await page.getByRole("button", { name: "Quarterly", exact: true }).click();
await page.getByRole("button", { name: "5", exact: true }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/04_weak.png` });
console.log("saved 04_weak.png");
await panelText("quarterly, 5 yr, 30%");

console.log("\nconsole errors:", errors.length ? errors : "none");
await browser.close();
