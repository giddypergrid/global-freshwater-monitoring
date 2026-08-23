/** Whole-app exam: every route, console/page errors, network failures, layout overflow. */
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const b = await chromium.launch({ channel: "msedge" });

const findings = [];
async function exam(label, url, width, height) {
  const p = await b.newPage({ viewport: { width, height } });
  const errs = [], bad = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  p.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));

  await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(7000);

  const overflow = await p.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
      ? `${document.documentElement.scrollWidth} > ${window.innerWidth}`
      : null,
  );
  const canvases = await p.locator("canvas").count();
  const title = await p.title();
  findings.push({ label, url, size: `${width}x${height}`, title, canvases, overflow, errs, bad });
  await p.screenshot({ path: `screenshots/audit_${label}.png`, fullPage: height > 900 });
  await p.close();
}

await exam("home_wide", "/", 1600, 1000);
await exam("tool_wide", "/tool", 1600, 1000);
await exam("tool_narrow", "/tool", 420, 900);
await exam("tool_mid", "/tool", 900, 800);
await exam("bad_catchment", "/tool?catchment=9999999999", 1600, 1000);
await exam("bad_nutrient", "/tool?nutrient=xx", 1600, 1000);

for (const f of findings) {
  console.log(`\n[${f.label}] ${f.url} @ ${f.size}`);
  console.log(`  title    : ${f.title}`);
  console.log(`  canvases : ${f.canvases}`);
  console.log(`  overflowX: ${f.overflow ?? "none"}`);
  console.log(`  http>=400: ${f.bad.length ? f.bad.join("\n             ") : "none"}`);
  console.log(`  errors   : ${f.errs.length ? f.errs.join("\n             ") : "none"}`);
}
await b.close();
