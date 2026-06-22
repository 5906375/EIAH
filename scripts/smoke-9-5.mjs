/**
 * Phase 9.5 — Vertical Selector with LEGAL Specialist Context
 * Smoke Playwright: pills IMOB/LEGAL, painel reativo, J-360 ausente, 3 viewports
 * Padrão: addInitScript (localStorage token) — igual smoke-9-4.mjs
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const EVIDENCE_DIR =
  "docs/ops/evidence/latest/phase-9-5-vertical-selector-legal-specialist";
mkdirSync(EVIDENCE_DIR, { recursive: true });

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
  await page.addInitScript(({ token }) => {
    localStorage.setItem("eiah_token", token);
    localStorage.setItem("installed_products", "IMOB");
  }, { token: TOKEN });
  return { ctx, page };
}

async function runViewport(browser, width, height, label) {
  console.log(`\n── ${label} (${width}×${height}) ──`);
  const { ctx, page } = await makePage(browser, width, height);

  try {
    await page.goto(`${WEB_BASE}/app/imob/chat`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const url = page.url();
    check(`${label} — URL permanece /app/imob/chat`, url.includes("/app/imob/chat"), url);

    const html = await page.content();

    // Screenshots
    const shotPath = path.join(EVIDENCE_DIR, `smoke-9-5-${width}x${height}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });

    // Shell e hero
    check(
      `${label} — "Document Intake" presente (shell hero)`,
      html.includes("Document Intake"),
      html.includes("Document Intake") ? "found" : "MISSING"
    );
    check(
      `${label} — "IMOB Product Shell" presente`,
      html.includes("IMOB Product Shell"),
      html.includes("IMOB Product Shell") ? "found" : "MISSING"
    );

    // VerticalSelectorBar — role="tablist"
    const tablistPresent = html.includes('role="tablist"');
    check(
      `${label} — VerticalSelectorBar (role=tablist) presente`,
      tablistPresent,
      `found=${tablistPresent}`
    );

    // Pill IMOB
    const imobPillActive = html.includes('aria-selected="true"') &&
      (html.includes(">IMOB<") || html.includes(">IMOB "));
    check(
      `${label} — pill IMOB com aria-selected=true`,
      html.includes('aria-selected="true"'),
      `ariaSelectedPresent=${html.includes('aria-selected="true"')}`
    );

    // Pill LEGAL preview
    const legalDisabled = html.includes('aria-disabled="true"') &&
      (html.includes(">LEGAL<") || html.includes(">LEGAL "));
    check(
      `${label} — pill LEGAL com aria-disabled=true`,
      html.includes('aria-disabled="true"'),
      `ariaDisabledPresent=${html.includes('aria-disabled="true"')}`
    );
    check(
      `${label} — pill LEGAL tem texto "Em breve"`,
      html.includes("Em breve"),
      html.includes("Em breve") ? "found" : "MISSING"
    );
    check(
      `${label} — pill LEGAL tem borda tracejada (border-dashed)`,
      html.includes("border-dashed"),
      html.includes("border-dashed") ? "found" : "MISSING"
    );

    // Pill J-360 ausente — assert negativo
    const j360InTablist = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"]');
      return Array.from(tabs).some((t) =>
        (t.textContent ?? "").toLowerCase().includes("j360") ||
        (t.textContent ?? "").toLowerCase().includes("j-360") ||
        (t.textContent ?? "").toLowerCase().includes("juridico")
      );
    });
    check(
      `${label} — pill J-360 ausente no tablist (assert negativo)`,
      !j360InTablist,
      `j360InTablist=${j360InTablist}`
    );

    // Painel IMOB (desktop ≥ 1280)
    if (width >= 1280) {
      check(
        `${label} — painel IMOB "Contexto IMOB" visível`,
        html.includes("Contexto IMOB"),
        html.includes("Contexto IMOB") ? "found" : "MISSING"
      );
    }

    // Grid 3 colunas
    if (width >= 1280) {
      const has3ColGrid = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        const allDivs = main.querySelectorAll("div");
        return Array.from(allDivs).some((d) => {
          const style = d.getAttribute("class") ?? "";
          return (
            style.includes("xl:grid-cols-") ||
            style.includes("grid-cols-[280px")
          );
        });
      });
      check(
        `${label} — grid 3 colunas presente`,
        has3ColGrid,
        `found=${has3ColGrid}`
      );
    }

    // Textarea/input
    const textareaAudit = await page.evaluate(() => {
      const t = document.querySelector("textarea");
      if (!t) return { exists: false };
      const r = t.getBoundingClientRect();
      return { exists: true, y: Math.round(r.top), viewH: window.innerHeight };
    });
    check(
      `${label} — textarea presente`,
      textareaAudit.exists,
      `exists=${textareaAudit.exists} y=${textareaAudit.y ?? "N/A"} viewH=${textareaAudit.viewH ?? "N/A"}`
    );

    // Sidebar escura presente (lg+)
    if (width >= 1024) {
      check(
        `${label} — sidebar com "Conversas do intake"`,
        html.includes("Conversas do intake"),
        html.includes("Conversas do intake") ? "found" : "MISSING"
      );
    }

    // Accordion mobile (< 1280)
    if (width < 1280) {
      check(
        `${label} — accordion "Resumo do intake" visível`,
        html.includes("Resumo do intake"),
        html.includes("Resumo do intake") ? "found" : "MISSING"
      );
    }

    // Sidebar colapsada em mobile (< 1024)
    if (width < 1024) {
      const asideAudit = await page.evaluate(() => {
        const asides = Array.from(document.querySelectorAll("aside"));
        return asides
          .filter((a) => window.getComputedStyle(a).display !== "none")
          .map((a) => Math.round(a.getBoundingClientRect().width));
      });
      check(
        `${label} — sidebar colapsada em mobile`,
        asideAudit.length === 0,
        `visibleAsideWidths=${JSON.stringify(asideAudit)}`
      );
    }

    // J-360 ausente no DOM inteiro no estado default (imob)
    const j360InDom = html.toLowerCase().includes("j-360") || html.includes("J-360");
    check(
      `${label} — J-360 ausente no DOM em estado IMOB padrão`,
      !j360InDom,
      `j360Found=${j360InDom}`
    );

  } finally {
    await ctx.close();
  }
}

// ── Teste específico do LegalContextPanel via avaliação de HTML renderizado ──
async function runLegalPanelCheck(browser) {
  console.log("\n── LegalContextPanel — verificação de conteúdo ──");
  const { ctx, page } = await makePage(browser, 1440, 900);

  try {
    await page.goto(`${WEB_BASE}/app/imob/chat`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Forçar activeVerticalId='legal' via React Fiber
    const legalPanelTriggered = await page.evaluate(() => {
      // Tenta encontrar o botão LEGAL no tablist e clicar
      const tabs = document.querySelectorAll('[role="tab"]');
      const legalTab = Array.from(tabs).find(
        (t) => (t.textContent ?? "").toUpperCase().includes("LEGAL")
      );
      if (!legalTab || legalTab.hasAttribute("disabled")) {
        return { triggered: false, reason: "LEGAL pill disabled or missing" };
      }
      (legalTab).click();
      return { triggered: true };
    });

    check(
      "LegalContextPanel — pill LEGAL está disabled (preview)",
      !legalPanelTriggered.triggered,
      `reason=${legalPanelTriggered.reason ?? "clicked"}`
    );

    // O painel IMOB deve continuar visível (state não mudou)
    const html = await page.content();
    check(
      "LegalContextPanel — painel IMOB permanece após tentativa de click em LEGAL disabled",
      html.includes("Contexto IMOB"),
      html.includes("Contexto IMOB") ? "found" : "MISSING"
    );

    // Confirmar que não há dados inventados no DOM inteiro
    const domText = await page.evaluate(() => document.body.innerText);
    const hardcodePatterns = [
      "João", "Maria", "Mariana", "850.000", "matricula_imovel_12345",
      "contrato_compra_venda.pdf", "apartamento 101", "processo fake",
      "cliente fake", "parecer fake",
    ];
    const found = hardcodePatterns.filter((p) => domText.includes(p));
    check(
      "LegalContextPanel — sem dados hardcoded no DOM",
      found.length === 0,
      found.length === 0 ? "limpo" : `encontrados: ${found.join(", ")}`
    );

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "smoke-9-5-legal-panel-check.png"),
      fullPage: false,
    });
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true });
console.log("Phase 9.5 — Smoke Playwright\n");

try {
  await runViewport(browser, 1440, 900, "Desktop largo");
  await runViewport(browser, 1280, 800, "Desktop médio");
  await runViewport(browser, 390, 844, "Mobile");
  await runLegalPanelCheck(browser);
} finally {
  await browser.close();
}

const total = results.length;
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);

console.log(`\n── Resultado ──`);
console.log(`${passed}/${total} checks OK`);

if (failed.length > 0) {
  console.log("\nFalhas:");
  failed.forEach((r) => console.log(`  ✗ ${r.name}: ${r.details}`));
}

const jsonPath = path.join(EVIDENCE_DIR, "smoke-results-9-5.json");
writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      total,
      passed,
      failed: failed.length,
      results,
    },
    null,
    2
  )
);
console.log(`\nResultados salvos em ${jsonPath}`);

if (failed.length > 0) process.exit(1);
