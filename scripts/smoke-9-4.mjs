/**
 * Phase 9.4 — Multi-Vertical SaaS Product Visual Convergence
 * Smoke Playwright: shell, sidebar, main e painel em 4 resoluções
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-4-multivertical-saas-product-convergence";
mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
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
  const { ctx, page } = await makePage(browser, 1440, 900);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1800);

  const html = await page.content();
  check("IMOB Product Shell presente", html.includes("IMOB Product Shell"), html.includes("IMOB Product Shell") ? "found" : "MISSING");
  check("Resumo do intake presente", html.includes("Resumo do intake"), html.includes("Resumo do intake") ? "found" : "MISSING");
  check("Resumo render-only via props presente", html.includes("Resumo render-only"), html.includes("Resumo render-only") ? "found" : "MISSING");
  check("Shell imersivo via props presente", html.includes("Shell imersivo"), html.includes("Shell imersivo") ? "found" : "MISSING");
  check("Nova sidebar presente", html.includes("Conversas do intake"), html.includes("Conversas do intake") ? "found" : "MISSING");
  check("Context helper presente", html.includes("Dados mascarados e destinos seguros emitidos pelo payload atual."), html.includes("Dados mascarados e destinos seguros emitidos pelo payload atual.") ? "found" : "MISSING");
  check("Empty state preservado", html.includes("Sem intake ativo"), html.includes("Sem intake ativo") ? "found" : "MISSING");

  const shellAudit = await page.evaluate(() => {
    const bodyText = document.body.textContent ?? "";
    const shell = document.querySelector("main");
    const cards = Array.from(document.querySelectorAll("section")).length;
    const textarea = document.querySelector("textarea");
    const shellRect = shell?.getBoundingClientRect();
    const textareaRect = textarea?.getBoundingClientRect();
    return {
      bodyText,
      cardCount: cards,
      shellWidth: shellRect ? Math.round(shellRect.width) : null,
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      viewportH: window.innerHeight,
    };
  });

  check("Textarea visível no desktop", typeof shellAudit.textareaY === "number" && shellAudit.textareaY < shellAudit.viewportH, JSON.stringify(shellAudit));
  check("Shell amplo no desktop", (shellAudit.shellWidth ?? 0) >= 1280, JSON.stringify(shellAudit));
  await ctx.close();
}

for (const { w, h } of VIEWPORTS) {
  const { ctx, page } = await makePage(browser, w, h);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const label = `${w}x${h}`;
  const url = page.url();
  check(`[${label}] URL = /app/imob/chat`, url.includes("/app/imob/chat"), url);

  const layoutAudit = await page.evaluate(() => {
    const visibleAsides = Array.from(document.querySelectorAll("aside")).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    ).length;
    const textarea = document.querySelector("textarea");
    const textareaRect = textarea?.getBoundingClientRect();
    return {
      visibleAsides,
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      viewportH: window.innerHeight,
    };
  });

  const textareaVisible =
    typeof layoutAudit.textareaY === "number" &&
    layoutAudit.textareaY > 0 &&
    layoutAudit.textareaY < layoutAudit.viewportH;

  check(`[${label}] textarea visível`, textareaVisible, JSON.stringify(layoutAudit));
  if (w >= 1024) {
    check(`[${label}] shell desktop com 2 asides`, layoutAudit.visibleAsides >= 2, JSON.stringify(layoutAudit));
  } else {
    check(`[${label}] sidebar continua oculta abaixo de lg`, layoutAudit.visibleAsides <= 1, JSON.stringify(layoutAudit));
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

const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-4.json");
writeFileSync(outJson, JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2));
console.log(`Results saved: ${outJson}`);

if (fail > 0) process.exit(1);
