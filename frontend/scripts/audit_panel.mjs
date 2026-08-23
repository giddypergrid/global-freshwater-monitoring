/** Dumps every panel number in each drill-down state, so stale scope shows up as text. */
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

async function dump(label, url, clickSite = false) {
  await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);
  if (clickSite) {
    for (const [x, y] of [[1130, 430], [1120, 425], [960, 520], [893, 604], [1186, 490]]) {
      await p.mouse.click(x, y);
      await p.waitForTimeout(900);
      if ((await p.locator("aside h2").nth(2).innerText()).includes("Site")) break;
    }
  }
  console.log(`\n======== ${label}  (${url})`);
  console.log(await p.locator("aside").innerText());
}

await dump("A world, nothing selected", "/tool");
await dump("B catchment open", "/tool?catchment=7060373260");
await dump("C site open", "/tool?catchment=5060084180", true);
console.log("\npage errors:", errs.length ? errs : "none");
await b.close();
