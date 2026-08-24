/**
 * Renders an nbconvert HTML export to PDF through the installed Edge.
 * Used because weasyprint and wkhtmltopdf are not on this machine.
 *
 * Usage: node scripts/nb_to_pdf.mjs <input.html> <output.pdf>
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/nb_to_pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: "networkidle" });

// Trim the notebook chrome that has no meaning on paper.
await page.addStyleTag({
  content: `
    @page { margin: 16mm 14mm; }
    body { font-size: 10.5pt; }
    .jp-InputPrompt, .jp-OutputPrompt { display: none !important; }
    .jp-Cell { page-break-inside: avoid; margin-bottom: 6px; }
    .jp-CodeCell .jp-InputArea { background: #f7f9fa; border-radius: 4px; }
    pre, code { font-size: 8.6pt !important; }
    table { font-size: 8.6pt; }
    h1 { page-break-before: avoid; }
    h2 { page-break-after: avoid; margin-top: 16px; }
    img { max-width: 100% !important; }
  `,
});
await page.waitForTimeout(1200);

await page.pdf({
  path: resolve(output),
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:7pt;color:#8a97a3;width:100%;padding:0 14mm;">Acceptance tests, Global Freshwater Monitoring Design</div>',
  footerTemplate: '<div style="font-size:7pt;color:#8a97a3;width:100%;padding:0 14mm;text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: "18mm", bottom: "16mm", left: "14mm", right: "14mm" },
});

await browser.close();
console.log(`wrote ${output}`);
