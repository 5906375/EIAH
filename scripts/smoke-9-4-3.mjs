/**
 * Phase 9.4.3 — Sidebar History Scroll Containment
 * Smoke Playwright: estressa a lista de conversas da sidebar para garantir
 * scroll interno sem expandir a altura do workbench.
 */
import pkg from "/home/jusall/.npm/_npx/48b1ca104c3549f4/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const EVIDENCE_DIR = "docs/ops/evidence/latest/phase-9-4-3-sidebar-history-scroll-containment";
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

  if (w >= 1024) {
    await page.evaluate(() => {
      const listHeading = Array.from(document.querySelectorAll("p")).find((node) =>
        (node.textContent ?? "").includes("Conversas recentes"),
      );
      const scroller = listHeading?.parentElement?.nextElementSibling;
      if (!scroller) return;
      const firstCard = scroller.querySelector("button");
      const buildCard = (index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "w-full rounded-[18px] border border-white/6 bg-white/[0.02] px-3 py-3 text-left text-slate-300";
        button.innerHTML = `<div class=\"flex items-center justify-between gap-2\"><p class=\"truncate text-[11px] font-medium\">Conversa adicional ${index + 1}</p><span class=\"rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-400\">Histórico</span></div><p class=\"mt-1.5 truncate text-[10px] leading-5 opacity-80\">Item extra para stress visual da sidebar.</p>`;
        return button;
      };
      for (let index = 0; index < 24; index += 1) {
        const clone = firstCard ? firstCard.cloneNode(true) : buildCard(index);
        if (clone instanceof HTMLElement && !firstCard) {
          clone.setAttribute("data-sidebar-stress", "true");
        }
        scroller.appendChild(clone);
      }
    });
  }

  const audit = await page.evaluate(() => {
    const visibleAsides = Array.from(document.querySelectorAll("aside")).filter(
      (node) => window.getComputedStyle(node).display !== "none",
    );
    const sidebarRoot = visibleAsides[0] ?? null;
    const sidebarInner = sidebarRoot?.firstElementChild ?? null;
    const listHeading = Array.from(document.querySelectorAll("p")).find((node) =>
      (node.textContent ?? "").includes("Conversas recentes"),
    );
    const listScroller = listHeading?.parentElement?.nextElementSibling ?? null;
    const textarea = document.querySelector("textarea");
    const article = document.querySelector("article");
    const shell = article?.closest(".grid")?.parentElement ?? null;
    const textareaRect = textarea?.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      viewportH: window.innerHeight,
      textareaY: textareaRect ? Math.round(textareaRect.top) : null,
      visibleAsides: visibleAsides.length,
      shell: shell ? { clientHeight: shell.clientHeight, scrollHeight: shell.scrollHeight } : null,
      sidebarRoot: sidebarRoot
        ? {
            clientHeight: sidebarRoot.clientHeight,
            scrollHeight: sidebarRoot.scrollHeight,
            minHeight: getComputedStyle(sidebarRoot).minHeight,
          }
        : null,
      sidebarInner: sidebarInner
        ? {
            clientHeight: sidebarInner.clientHeight,
            scrollHeight: sidebarInner.scrollHeight,
            overflowY: getComputedStyle(sidebarInner).overflowY,
          }
        : null,
      listScroller: listScroller
        ? {
            clientHeight: listScroller.clientHeight,
            scrollHeight: listScroller.scrollHeight,
            overflowY: getComputedStyle(listScroller).overflowY,
          }
        : null,
      article: article ? { clientHeight: article.clientHeight, scrollHeight: article.scrollHeight } : null,
    };
  });

  const textareaVisible =
    typeof audit.textareaY === "number" &&
    audit.textareaY > 0 &&
    audit.textareaY < audit.viewportH;
  check(`[${label}] textarea visível`, textareaVisible, JSON.stringify(audit));
  check(`[${label}] zoom headless 100%`, audit.dpr === 1, JSON.stringify(audit));

  if (w >= 1024) {
    check(
      `[${label}] histórico rola internamente`,
      typeof audit.listScroller?.scrollHeight === "number" &&
        typeof audit.listScroller?.clientHeight === "number" &&
        audit.listScroller.scrollHeight > audit.listScroller.clientHeight &&
        audit.listScroller.overflowY === "auto",
      JSON.stringify(audit),
    );
    check(
      `[${label}] sidebar não expande o shell`,
      audit.shell?.scrollHeight === audit.shell?.clientHeight &&
        audit.sidebarRoot?.scrollHeight === audit.sidebarRoot?.clientHeight &&
        audit.sidebarInner?.scrollHeight === audit.sidebarInner?.clientHeight,
      JSON.stringify(audit),
    );
    check(
      `[${label}] painel direito permanece alinhado`,
      audit.visibleAsides >= 2 && audit.article?.scrollHeight === audit.article?.clientHeight,
      JSON.stringify(audit),
    );
  } else {
    check(`[${label}] mobile preservado`, audit.visibleAsides <= 1, JSON.stringify(audit));
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

const outJson = path.join(EVIDENCE_DIR, "smoke-results-9-4-3.json");
writeFileSync(outJson, JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2));
console.log(`Results saved: ${outJson}`);

if (fail > 0) process.exit(1);
