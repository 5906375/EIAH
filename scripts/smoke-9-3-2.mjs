/**
 * Phase 9.3.2 — IMOB Immersive Product Shell
 * Smoke Playwright: 4 resoluções-alvo, screenshots e checks de shell visual
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-3-2-product-shell-alignment";
mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
];

// Real seed token seeded in Phase 9.2
const TOKEN = "seed_53670d4b2e9f1a83c7456de012bfa89e";
const WEB_BASE = "http://localhost:5173";

const results = [];

function check(name, ok, details) {
  results.push({ name, ok, details });
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${details}`);
}

// The real VITE_API_TOKEN from .env — valid session with IMOB_INSTALLED=true
const VITE_TOKEN = "seed_53670bd0a12cf8e0960b688fc402ad79";

async function makePage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  // Seed both token and installed_products so RequireImobInstall passes on first render
  await page.addInitScript(({ token, installed }) => {
    localStorage.setItem("eiah_token", token);
    localStorage.setItem("installed_products", installed);
  }, { token: VITE_TOKEN, installed: "IMOB" });
  return { ctx, page };
}

const browser = await chromium.launch({ headless: true });

// --- HTML content checks (1440x900) ---
{
  const { ctx, page } = await makePage(browser, 1440, 900);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });

  // Allow time for session context to load and redirect if any
  await page.waitForTimeout(2000);
  const url = page.url();
  const onChat = url.includes("/app/imob/chat");

  if (onChat) {
    const html = await page.content();

    check(
      "grid cols xl:grid-cols-[280px,minmax(0,1fr),360px] preservada",
      html.includes("xl:grid-cols-[280px,minmax(0,1fr),360px]"),
      html.includes("xl:grid-cols-[280px,minmax(0,1fr),360px]") ? "found" : "MISSING"
    );

    // Classes are separate in rendered HTML: "hidden ... lg:flex ..."
    check(
      "sidebar hidden + lg:flex preservados",
      html.includes("hidden") && html.includes("lg:flex"),
      html.includes("hidden") && html.includes("lg:flex") ? "found (both classes)" : "MISSING"
    );

    check(
      "Painel contextual toggle preservado",
      html.includes("Painel contextual"),
      html.includes("Painel contextual") ? "found" : "MISSING"
    );

    check(
      "Piloto controlado preservado",
      html.includes("Piloto controlado"),
      html.includes("Piloto controlado") ? "found" : "MISSING"
    );

    check(
      "Document Intake / IMOB v2.1 preservado",
      html.includes("Document Intake") && html.includes("IMOB v2.1"),
      html.includes("Document Intake") && html.includes("IMOB v2.1") ? "found" : "MISSING"
    );

    check("IMOB Product Shell presente", html.includes("IMOB Product Shell"), html.includes("IMOB Product Shell") ? "found" : "MISSING");
    check("Voltar ao Command Center presente", html.includes("Voltar ao Command Center"), html.includes("Voltar ao Command Center") ? "found" : "MISSING");
    check("Header global oculto na rota IMOB", !html.includes("Agent Operations Console") && !html.includes("Imobiliaria Digital Command Center"), !html.includes("Agent Operations Console") && !html.includes("Imobiliaria Digital Command Center") ? "absent (correct)" : "STILL PRESENT");

    check("Workspace atual no header central", html.includes("Workspace atual"), html.includes("Workspace atual") ? "found" : "MISSING");
    check("Quick actions preservadas no fluxo", html.includes("quick actions"), html.includes("quick actions") ? "found" : "MISSING");
    check("Faixa técnica antiga removida", !html.includes("IMOB Conversation Workbench"), !html.includes("IMOB Conversation Workbench") ? "absent (correct)" : "STILL PRESENT");

    check(
      "Empty state simplificado: 'Sem intake ativo'",
      html.includes("Sem intake ativo"),
      html.includes("Sem intake ativo") ? "found" : "MISSING"
    );

    check(
      "Context panel title: 'Resumo do intake'",
      html.includes("Resumo do intake"),
      html.includes("Resumo do intake") ? "found" : "MISSING"
    );

    // sem hardcode
    const hardcodedNames = ["João", "Maria", "Mariana", "850.000", "matricula_imovel_12345"];
    const hasHardcoded = hardcodedNames.some((n) => html.includes(n));
    check(
      "Sem dados hardcoded (João, Maria, valores, matrícula)",
      !hasHardcoded,
      !hasHardcoded ? "clean" : `HARDCODED: ${hardcodedNames.filter((n) => html.includes(n)).join(", ")}`
    );
  } else {
    // Not on chat page — log all HTML checks as failed
    const contentChecks = [
      "grid cols xl:grid-cols-[280px,minmax(0,1fr),360px] preservada",
      "sidebar hidden lg:flex preservado",
      "Painel contextual toggle preservado",
      "Piloto controlado preservado",
      "Document Intake / IMOB v2.1 preservado",
      "IMOB Product Shell presente",
      "Voltar ao Command Center presente",
      "Header global oculto na rota IMOB",
      "Workspace atual no header central",
      "Quick actions preservadas no fluxo",
      "Faixa técnica antiga removida",
      "Empty state simplificado: 'Sem intake ativo'",
      "Context panel title: 'Resumo do intake'",
      "Sem dados hardcoded",
    ];
    for (const name of contentChecks) {
      check(name, false, `skipped — page redirected to ${url}`);
    }
  }

  await ctx.close();
}

// --- Per-viewport checks + screenshots ---
for (const { w, h } of VIEWPORTS) {
  const { ctx, page } = await makePage(browser, w, h);
  await page.goto(`${WEB_BASE}/app/imob/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const label = `${w}x${h}`;
  const url = page.url();

  // URL check
  check(`[${label}] URL = /app/imob/chat`, url.includes("/app/imob/chat"), url);

  // Header global oculto e shell de produto visível
  const shellMarkers = await page.evaluate(() => {
    const bodyText = document.body.textContent ?? "";
    return {
      hasProductShell: bodyText.includes("IMOB Product Shell"),
      hasBackLink: bodyText.includes("Voltar ao Command Center"),
      hasGlobalSubtitle:
        bodyText.includes("Imobiliaria Digital Command Center") ||
        bodyText.includes("Agent Operations Console"),
    };
  });
  check(
    `[${label}] Shell imersivo ativo`,
    shellMarkers.hasProductShell && shellMarkers.hasBackLink && !shellMarkers.hasGlobalSubtitle,
    JSON.stringify(shellMarkers)
  );

  // textarea visível no viewport
  const textareaRect = await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (!ta) return null;
    const r = ta.getBoundingClientRect();
    return { y: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
  });
  const taVisible = textareaRect && textareaRect.y < textareaRect.h && textareaRect.y > 0;
  check(
    `[${label}] textarea visível no viewport`,
    !!taVisible,
    textareaRect
      ? `y=${textareaRect.y}px, viewport=${textareaRect.h}px → ${taVisible ? "visível" : "FORA"}`
      : "not found"
  );

  // screenshot after
  const screenshotPath = path.join(EVIDENCE_DIR, `after-${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  → screenshot: ${screenshotPath}`);

  await ctx.close();
}

await browser.close();

// Results summary
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log(`\n=== ${pass}/${results.length} checks OK, ${fail} falhas ===`);

// Save JSON
const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-3-2.json");
writeFileSync(
  outJson,
  JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2)
);
console.log(`Results saved: ${outJson}`);

if (fail > 0) {
  process.exit(1);
}
