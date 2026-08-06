import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.argv[2] ?? "/tool?catchment=waikato";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) =>
  logs.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`),
);

const responses = [];
page.on("response", (r) => responses.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}${url}`, { waitUntil: "load" });
await page.waitForTimeout(8000);

console.log("=== url ===", page.url());
console.log("\n=== responses ===");
console.log(responses.join("\n"));
console.log("\n=== console/errors ===");
console.log(logs.length ? logs.join("\n") : "(none)");
console.log("\n=== panel text ===");
console.log(await page.locator("aside").innerText().catch(() => "(no aside)"));
console.log("\n=== canvas count ===", await page.locator("canvas").count());
console.log("=== leaflet container ===", await page.locator(".leaflet-container").count());

await browser.close();
