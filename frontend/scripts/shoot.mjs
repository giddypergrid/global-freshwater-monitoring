/**
 * Screenshot the running app and report console errors.
 * Usage: npm start (in another shell), then `node scripts/shoot.mjs [outDir]`
 * Drives the installed Edge — no Playwright browser download needed.
 */
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "screenshots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HAS_CANVAS = "() => document.querySelectorAll('canvas').length > 0";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

async function shot(url, file, waitFor) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForFunction(waitFor, null, { timeout: 20000 });
  await page.waitForTimeout(3500); // let map tiles settle
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

// Landing page now embeds the tool, so it needs the map to be up before capture.
await shot("/", "01_landing.png", HAS_CANVAS);
await page.screenshot({ path: `${OUT}/01_landing_full.png`, fullPage: true });
console.log("saved 01_landing_full.png");

await shot("/tool?catchment=waikato", "03_waikato.png", HAS_CANVAS);
await panelText("Waikato, 10yr monthly, 20%");

// Weakest design must visibly drop the power figures.
await page.getByRole("button", { name: "5 yr" }).click();
await page.getByRole("button", { name: "Quarterly" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/04_waikato_weak.png` });
console.log("saved 04_waikato_weak.png");
await panelText("Waikato, 5yr quarterly, 20%");

await shot("/tool?catchment=rhine", "05_rhine.png", HAS_CANVAS);
await panelText("Rhine, 10yr monthly, 20%");

console.log("\nconsole errors:", errors.length ? errors : "none");
await browser.close();
