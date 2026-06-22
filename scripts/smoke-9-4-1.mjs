/**
 * Phase 9.4.1 — Mobile Product Shell Density
 * Smoke Playwright: compactacao do hero em mobile + desktop preservado
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-4-1-mobile-product-shell-density";
mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
  { w: 375, h: 667 },
];

const TOKEN = "seed_53670bd0a12cf8e0960b688fc402ad79";
const WEB_BASE = "http://localhost:5173";
const results = [];

function check(name, ok, details) {
  results.push({ name, ok, details });
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${details}`);
}

async function makePage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.addInitScript(({ token, installed }) => {
    localStorage.setItem("eiah_token", token);
    localStorage.setItem("installed_products", installed);
  }, { token: TOKEN, installed: "IMOB" });
  return { ctx, page };
}

const browser = await chromium.launch({ headless: true });

{
  const { ctx, page } = await makePage(browser, 375, 667);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1800);

  const mobileAudit = await page.evaluate(() => {
    const descriptionNode = Array.from(document.querySelectorAll("p")).find((node) =>
      (node.textContent ?? "").includes("Workspace dedicado para intake documental"),
    );
    const workspaceNode = Array.from(document.querySelectorAll("p")).find((node) =>
      (node.textContent ?? "").includes("Workspace atual"),
    );
    const bodyText = document.body.textContent ?? "";
    const textarea = document.querySelector("textarea");
    const textareaRect = textarea?.getBoundingClientRect();
    return {
      workspaceTop: workspaceNode ? Math.round(workspaceNode.getBoundingClientRect().top) : null,
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      viewportH: window.innerHeight,
      descriptionVisible: descriptionNode ? window.getComputedStyle(descriptionNode).display !== "none" : null,
      hasShellLabel: bodyText.includes("IMOB Product Shell"),
      hasStatus: bodyText.includes("Piloto controlado"),
    };
  });

  check("[375x667] hero compacto", typeof mobileAudit.workspaceTop === "number" && mobileAudit.workspaceTop <= 170, JSON.stringify(mobileAudit));
  check("[375x667] textarea visível cedo", typeof mobileAudit.textareaY === "number" && mobileAudit.textareaY < 620, JSON.stringify(mobileAudit));
  check("[375x667] descrição longa oculta", mobileAudit.descriptionVisible === false, JSON.stringify(mobileAudit));
  check("[375x667] título e status preservados", mobileAudit.hasShellLabel && mobileAudit.hasStatus, JSON.stringify(mobileAudit));
  await ctx.close();
}

for (const { w, h } of VIEWPORTS) {
  const { ctx, page } = await makePage(browser, w, h);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const label = `${w}x${h}`;
  check(`[${label}] URL = /app/imob/chat`, page.url().includes("/app/imob/chat"), page.url());

  const audit = await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    const textareaRect = textarea?.getBoundingClientRect();
    const visibleAsides = Array.from(document.querySelectorAll("aside")).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    ).length;
    return {
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      viewportH: window.innerHeight,
      visibleAsides,
    };
  });

  const textareaVisible =
    typeof audit.textareaY === "number" &&
    audit.textareaY > 0 &&
    audit.textareaY < audit.viewportH;
  check(`[${label}] textarea visível`, textareaVisible, JSON.stringify(audit));

  if (w >= 1024) {
    check(`[${label}] desktop preservado com 2 asides`, audit.visibleAsides >= 2, JSON.stringify(audit));
  } else {
    check(`[${label}] sidebar continua oculta abaixo de lg`, audit.visibleAsides <= 1, JSON.stringify(audit));
  }

  const screenshotPath = path.join(EVIDENCE_DIR, `after-${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  → screenshot: ${screenshotPath}`);
  await ctx.close();
}

await browser.close();

const pass = results.filter((entry) => entry.ok).length;
const fail = results.filter((entry) => !entry.ok).length;
console.log(`\n=== ${pass}/${results.length} checks OK, ${fail} falhas ===`);

const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-4-1.json");
writeFileSync(outJson, JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2));
console.log(`Results saved: ${outJson}`);

if (fail > 0) process.exit(1);
