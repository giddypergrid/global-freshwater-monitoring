/**
 * Walks the three map states the 25 August 2026 review touched and reports what each one
 * actually drew: the opening world view with no site markers, a region with its own sites,
 * and an open catchment with its river network.
 *
 * Usage: npm run dev (in another shell), then `node scripts/check_review_ui.mjs [outDir]`
 * Set BASE_URL to point it at the deployed site instead of localhost.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "screenshots/review";

/** Canterbury, New Zealand: 106 TN and 107 TP site records, so the panel is never empty. */
const CATCHMENT = "5060084180";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

const responses = [];
page.on("response", (r) => responses.push([r.status(), r.url()]));

async function visit(query, file, label) {
  await page.goto(`${BASE}/tool${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("() => document.querySelectorAll('canvas').length > 0", null, {
    timeout: 20000,
  });
  await page.waitForTimeout(5000); // let the tiles, the power slice and the shard settle
  await page.screenshot({ path: `${OUT}/${file}` });
  const panel = await page
    .locator("aside")
    .innerText()
    .catch(() => "(no panel)");
  console.log(`\n=== ${label} ===`);
  console.log(`url   : ${page.url()}`);
  console.log(panel.split("\n").slice(0, 12).join("\n"));
}

await visit("", "01_world_no_sites.png", "opening world view");
await visit("?region=Europe", "02_region_europe.png", "region Europe");
await visit(`?catchment=${CATCHMENT}`, "03_catchment_rivers.png", `catchment ${CATCHMENT}`);

const named = (url) => url.split("/").pop().split("?")[0];
const rivers = responses.filter(([, u]) => u.includes("/data/rivers/"));
const failed = responses.filter(([status]) => status >= 400);

console.log(
  `\nriver shards fetched : ${rivers.map(([s, u]) => `${s} ${named(u)}`).join(", ") || "none"}`,
);
console.log(`failed requests      : ${failed.map(([s, u]) => `${s} ${u}`).join("\n") || "none"}`);
console.log(`console errors       : ${errors.length ? errors.join("\n") : "none"}`);

await browser.close();
