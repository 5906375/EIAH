/**
 * Phase 9.3.3 — IMOB Sidebar SaaS Alignment
 * Smoke Playwright: sidebar desktop + screenshots em 4 resoluções
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-3-3-sidebar-saas-alignment";
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
  check("IMOB Workspace presente", html.includes("IMOB Workspace"), html.includes("IMOB Workspace") ? "found" : "MISSING");
  check("Novo título da sidebar presente", html.includes("Conversas do intake"), html.includes("Conversas do intake") ? "found" : "MISSING");
  check("Título antigo removido", !html.includes("Conversas e operações"), !html.includes("Conversas e operações") ? "absent (correct)" : "STILL PRESENT");
  check("Busca rápida presente", html.includes("Busca rápida"), html.includes("Busca rápida") ? "found" : "MISSING");
  check("Conversas recentes presente", html.includes("Conversas recentes"), html.includes("Conversas recentes") ? "found" : "MISSING");
  check("Botão Nova conversa presente", html.includes("Nova conversa"), html.includes("Nova conversa") ? "found" : "MISSING");
  check("Botão Ver operações presente", html.includes("Ver operações") || html.includes("Ocultar operações"), html.includes("Ver operações") || html.includes("Ocultar operações") ? "found" : "MISSING");
  check("Empty state presente", html.includes("Nenhuma conversa registrada."), html.includes("Nenhuma conversa registrada.") ? "found" : "MISSING");

  const sidebarAudit = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const text = aside?.textContent ?? "";
    const input = aside?.querySelector("input");
    const searchWrap = input?.parentElement;
    const cards = aside?.querySelectorAll("button").length ?? 0;
    const style = aside ? window.getComputedStyle(aside) : null;
    return {
      display: style?.display ?? null,
      width: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      hasSearchInput: Boolean(input),
      hasSearchWrap: Boolean(searchWrap),
      buttonCount: cards,
      text,
    };
  });

  check("Sidebar desktop visível", sidebarAudit.display !== "none" && (sidebarAudit.width ?? 0) >= 260, JSON.stringify(sidebarAudit));
  check("Sidebar contém input de busca", sidebarAudit.hasSearchInput && sidebarAudit.hasSearchWrap, JSON.stringify(sidebarAudit));

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
    const asides = Array.from(document.querySelectorAll("aside"));
    const visibleAsides = asides.filter((node) => window.getComputedStyle(node).display !== "none");
    const textarea = document.querySelector("textarea");
    const rect = textarea?.getBoundingClientRect();
    return {
      visibleAsides: visibleAsides.length,
      textareaY: rect ? Math.round(rect.top) : null,
      viewportH: window.innerHeight,
    };
  });

  const textareaVisible =
    typeof layoutAudit.textareaY === "number" &&
    layoutAudit.textareaY > 0 &&
    layoutAudit.textareaY < layoutAudit.viewportH;

  if (w >= 1024) {
    check(`[${label}] sidebar visível no desktop`, layoutAudit.visibleAsides >= 2, JSON.stringify(layoutAudit));
  } else {
    check(`[${label}] sidebar oculta abaixo de lg`, layoutAudit.visibleAsides <= 1, JSON.stringify(layoutAudit));
  }
  check(`[${label}] textarea visível no viewport`, textareaVisible, JSON.stringify(layoutAudit));

  const screenshotPath = path.join(EVIDENCE_DIR, `after-${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  → screenshot: ${screenshotPath}`);

  await ctx.close();
}

await browser.close();

const pass = results.filter((entry) => entry.ok).length;
const fail = results.filter((entry) => !entry.ok).length;
console.log(`\n=== ${pass}/${results.length} checks OK, ${fail} falhas ===`);

const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-3-3.json");
writeFileSync(
  outJson,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      checks: results,
    },
    null,
    2,
  ),
);
console.log(`Results saved: ${outJson}`);

if (fail > 0) process.exit(1);
