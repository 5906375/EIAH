/**
 * Phase 9.4.2 — Desktop Composition & Chat Lane Width
 * Smoke Playwright: controla a largura util do chat lane em desktop largo
 * sem regredir mobile.
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-4-2-desktop-composition-chat-lane-width";
mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1600, h: 900 },
  { w: 1920, h: 1080 },
  { w: 2048, h: 1152 },
  { w: 390, h: 844 },
  { w: 375, h: 667 },
];

const TOKEN = "seed_53670bd0a12cf8e0960b688fc402ad79";
const WEB_BASE = "http://127.0.0.1:5173";
const results = [];

function check(name, ok, details) {
  results.push({ name, ok, details });
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${details}`);
}

async function makePage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(({ token, installed }) => {
    localStorage.setItem("eiah_token", token);
    localStorage.setItem("installed_products", installed);
  }, { token: TOKEN, installed: "IMOB" });
  return { ctx, page };
}

const browser = await chromium.launch({ headless: true });

for (const { w, h } of VIEWPORTS) {
  const { ctx, page } = await makePage(browser, w, h);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1800);

  const label = `${w}x${h}`;
  check(`[${label}] URL = /app/imob/chat`, page.url().includes("/app/imob/chat"), page.url());

  const audit = await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    const composer = textarea?.parentElement;
    const lane = composer?.parentElement;
    const article = textarea?.closest("article");
    const visibleAsides = Array.from(document.querySelectorAll("aside")).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    );
    const shellBadge = Array.from(document.querySelectorAll("span")).some((node) =>
      (node.textContent ?? "").includes("Piloto controlado"),
    );
    const bodyText = document.body.textContent ?? "";
    const textareaRect = textarea?.getBoundingClientRect();
    const composerRect = composer?.getBoundingClientRect();
    const laneRect = lane?.getBoundingClientRect();
    const articleRect = article?.getBoundingClientRect();
    const rightPanelRect = visibleAsides[1]?.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      viewportH: window.innerHeight,
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      textareaWidth: textareaRect ? Math.round(textareaRect.width) : null,
      composerWidth: composerRect ? Math.round(composerRect.width) : null,
      laneWidth: laneRect ? Math.round(laneRect.width) : null,
      articleWidth: articleRect ? Math.round(articleRect.width) : null,
      rightPanelLeft: rightPanelRect ? Math.round(rightPanelRect.left) : null,
      visibleAsides: visibleAsides.length,
      shellBadge,
      hasImobText: bodyText.includes("IMOB"),
    };
  });

  const textareaVisible =
    typeof audit.textareaY === "number" &&
    audit.textareaY > 0 &&
    audit.textareaY < audit.viewportH;
  check(`[${label}] textarea visível`, textareaVisible, JSON.stringify(audit));
  check(`[${label}] zoom headless 100%`, audit.dpr === 1, JSON.stringify(audit));
  check(`[${label}] labels do shell preservados`, audit.shellBadge && audit.hasImobText, JSON.stringify(audit));

  if (w >= 1440) {
    const laneRatio =
      typeof audit.laneWidth === "number" && typeof audit.articleWidth === "number"
        ? audit.laneWidth / audit.articleWidth
        : null;
    const composerRatio =
      typeof audit.composerWidth === "number" && typeof audit.articleWidth === "number"
        ? audit.composerWidth / audit.articleWidth
        : null;

    check(
      `[${label}] lane controlada no desktop`,
      typeof laneRatio === "number" && laneRatio < 0.84 && laneRatio > 0.48,
      JSON.stringify({ laneRatio, articleWidth: audit.articleWidth, laneWidth: audit.laneWidth }),
    );
    check(
      `[${label}] composer alinhado a largura util`,
      typeof composerRatio === "number" && composerRatio < 0.84 && composerRatio > 0.48,
      JSON.stringify({ composerRatio, articleWidth: audit.articleWidth, composerWidth: audit.composerWidth }),
    );
    check(
      `[${label}] painel direito permanece visível`,
      audit.visibleAsides >= 2 && typeof audit.rightPanelLeft === "number",
      JSON.stringify(audit),
    );
  } else {
    check(`[${label}] mobile da 9.4.1 preservado`, audit.visibleAsides <= 1, JSON.stringify(audit));
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

const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-4-2.json");
writeFileSync(outJson, JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2));
console.log(`Results saved: ${outJson}`);

if (fail > 0) process.exit(1);
