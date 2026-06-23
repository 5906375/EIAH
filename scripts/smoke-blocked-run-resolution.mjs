/**
 * Smoke: blocked_run_resolution presentation validation
 * Valida que o chat IMOB mostra apenas o resumo compacto de bloqueios.
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { writeFileSync, mkdirSync } from "fs";

const EVIDENCE_DIR = "docs/ops/evidence/latest/blocked-run-resolution-smoke";
mkdirSync(EVIDENCE_DIR, { recursive: true });

const TOKEN = "tok_e080724cb8b9dd9d0c40379dc84bfba8c132a7d88bf6e876";
const WEB_BASE = "http://localhost:5173";
const API_BASE = "http://localhost:8080";
const CONV_ID = "conv_72373810cbdcc51b";

const results = [];
const smokeAt = new Date().toISOString();

function check(name, ok, details) {
  results.push({ name, ok, details });
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${details}`);
}

async function makePage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ token }) => {
    localStorage.setItem("eiah_token", token);
    localStorage.setItem("installed_products", "IMOB");
  }, { token: TOKEN });
  return { ctx, page };
}

// ─── API smoke first ──────────────────────────────────────────────────────────
console.log("\n[1] API smoke: resolve-turn blocked_run_resolution");

const CASE_ID = "cmp33l96p00061bpbgfkf294l";
const apiResp = await fetch(`${API_BASE}/api/imob/chat/resolve-turn`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "mostrar bloqueios do caso", caseId: CASE_ID }),
});
const apiData = await apiResp.json();
const pres = apiData?.data?.presentation ?? {};

const text = pres.text ?? "";
const blocks = pres.blocks ?? [];
const forbidden = ["Resumo do caso", "Follow-up preparado", "Checklist acionável", "Pacote de handoff", "Pendências do negócio", "Como destravar"];

check("action = crm.case.blocked_run_resolution", apiData?.data?.action === "crm.case.blocked_run_resolution", apiData?.data?.action ?? "?");
check("text contém 'Bloqueio ativo'", /bloqueio ativo/i.test(text), text.slice(0, 100));
check("text contém 'Pendência crítica'", /pendência crítica/i.test(text), "");
check("text contém 'Próximo passo'", /próximo passo/i.test(text), "");
check("blocks vazio", blocks.length === 0, `${blocks.length} blocks: ${blocks.map(b => b.title ?? b.kind).join(", ")}`);
check("caseBrief ausente", !pres.caseBrief, pres.caseBrief ? "PRESENTE" : "absent");
check("preparedFollowUp ausente", !pres.preparedFollowUp, pres.preparedFollowUp ? "PRESENTE" : "absent");
check("actionableChecklist ausente", !pres.actionableChecklist, pres.actionableChecklist ? "PRESENTE" : "absent");
check("handoffPack ausente", !pres.handoffPack, pres.handoffPack ? "PRESENTE" : "absent");
check("widget suprimido (null)", !pres.widget, pres.widget ? `PRESENTE: ${pres.widget?.title ?? pres.widget?.kind}` : "null/absent");
check("card.title ≠ 'Como destravar'", !(pres.card?.title ?? "").includes("Como destravar"), `card.title = ${pres.card?.title ?? "N/A"}`);

const textForbiddenFound = forbidden.filter(f => text.includes(f));
check("texto não contém seções proibidas", textForbiddenFound.length === 0, textForbiddenFound.length > 0 ? `ENCONTRADO: ${textForbiddenFound.join(", ")}` : "ok");

// ─── Browser smoke ────────────────────────────────────────────────────────────
console.log("\n[2] Browser smoke: chat visual");

const browser = await chromium.launch({ headless: true });
const { ctx, page } = await makePage(browser);

try {
  await page.goto(`${WEB_BASE}/app/imob/chat/${CONV_ID}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const screenshot1 = `${EVIDENCE_DIR}/before-send-1440x900.png`;
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log(`  → Screenshot inicial: ${screenshot1}`);

  // Find input and send "mostrar bloqueios do caso"
  const input = await page.$("textarea, input[type='text']");
  if (input) {
    await input.fill("mostrar bloqueios do caso");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    console.log("  → Mensagem enviada: 'mostrar bloqueios do caso'");
    await page.waitForTimeout(5000);

    const screenshot2 = `${EVIDENCE_DIR}/after-send-1440x900.png`;
    await page.screenshot({ path: screenshot2, fullPage: false });
    console.log(`  → Screenshot após resposta: ${screenshot2}`);

    // Check DOM for forbidden sections
    const html = await page.content();
    const domForbidden = forbidden.filter(f => html.includes(f));
    check("DOM não contém headings proibidos", domForbidden.length === 0, domForbidden.length > 0 ? `DOM ENCONTROU: ${domForbidden.join(", ")}` : "limpo");

    // Check compact text visible
    const hasBlockerText = html.includes("Bloqueio ativo") || html.includes("bloqueio ativo");
    check("DOM contém 'Bloqueio ativo'", hasBlockerText, hasBlockerText ? "found" : "MISSING");
  } else {
    check("input encontrado", false, "textarea/input não encontrado");
  }
} catch (err) {
  console.error("  ERRO no browser smoke:", err.message);
  check("browser smoke sem erros", false, err.message);
} finally {
  await ctx.close();
}

await browser.close();

// ─── Report ───────────────────────────────────────────────────────────────────
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
const total = results.length;

console.log(`\n[RESULTADO] ${pass}/${total} checks passou | ${fail} falhas`);

const report = {
  smokeAt,
  summary: { pass, fail, total },
  checks: results,
  textSample: text.slice(0, 500),
  blocksCount: blocks.length,
  widgetPresent: !!pres.widget,
  widgetTitle: pres.widget?.title ?? null,
  cardTitle: pres.card?.title ?? null,
  note: pres.widget ? "BUG RESIDUAL: widget re-injetado por applyCanonicalJourneyToResolvedData via ?? operator (linha 3306 imobCrmBusinessRead.ts). Fix necessário." : "ok",
};

const reportPath = `${EVIDENCE_DIR}/smoke-results.json`;
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n[LOG] Resultados salvos: ${reportPath}`);

process.exit(fail > 0 ? 1 : 0);
