const CHECK = "f1-4-front-door-mobile-smoke";
const DEFAULT_BASE_URL = "http://127.0.0.1:5173";
const DEFAULT_ROUTE = "/app/imob/chat";
const DEFAULT_TOKEN = "seed_53670bd0a12cf8e0960b688fc402ad79";
const DEFAULT_INSTALLED_PRODUCTS = "IMOB";
const RUNNER_IMPORT = "formal_dependency:playwright";
const FALLBACK_USED = false;

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 740 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 768 },
];

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function loadPlaywright() {
  return import("playwright");
}

function makeViewportFailure(base, reasons) {
  return {
    ...base,
    ok: false,
    reasons,
  };
}

async function collectClosedState(page, viewport) {
  return page.evaluate(({ width }) => {
    const bodyText = document.body.textContent ?? "";
    const documentElement = document.documentElement;
    const textarea =
      document.querySelector("textarea") ??
      document.querySelector('input[type="text"]') ??
      document.querySelector('input:not([type])');
    const textareaRect = textarea?.getBoundingClientRect() ?? null;
    const selector =
      document.querySelector('[role="tablist"][aria-label="Seletor de vertical"]') ??
      document.querySelector('[aria-label="Seletor de vertical"]');
    const selectorRect = selector?.getBoundingClientRect() ?? null;
    const toggleButton = Array.from(document.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Resumo do intake"),
    );
    const toggleRect = toggleButton?.getBoundingClientRect() ?? null;

    const selectorOverflow =
      !selectorRect ||
      selectorRect.left < -1 ||
      selectorRect.right > window.innerWidth + 1 ||
      selector.scrollWidth - selector.clientWidth > 1;

    const composerVisible =
      !!textareaRect &&
      textareaRect.width > 0 &&
      textareaRect.height > 0 &&
      textareaRect.bottom > 0 &&
      textareaRect.top < window.innerHeight;

    const toggleVisible =
      !!toggleRect &&
      toggleRect.width > 0 &&
      toggleRect.height > 0 &&
      toggleRect.bottom > 0 &&
      toggleRect.top < window.innerHeight;

    return {
      width,
      clientWidth: documentElement.clientWidth,
      scrollWidth: documentElement.scrollWidth,
      horizontalOverflow: documentElement.scrollWidth > documentElement.clientWidth,
      composerVisible,
      selectorPresent: !!selector,
      selectorOverflow,
      toggleVisible,
      hasContextBadge: bodyText.includes("Contexto IMOB"),
      hasPilotCopy: /PILOTO CONTROLADO|Piloto controlado/.test(bodyText),
      hasMainContent:
        bodyText.includes("Workspace atual") ||
        bodyText.includes("Threads ativas") ||
        bodyText.includes("Sem intake ativo"),
    };
  }, viewport);
}

async function collectOpenState(page) {
  return page.evaluate(() => {
    const documentElement = document.documentElement;
    const bodyText = document.body.textContent ?? "";
    const contextTextCount = (bodyText.match(/Contexto IMOB/g) ?? []).length;
    return {
      horizontalOverflow: documentElement.scrollWidth > documentElement.clientWidth,
      clientWidth: documentElement.clientWidth,
      scrollWidth: documentElement.scrollWidth,
      contextTextCount,
      toggleOpen: bodyText.includes("Ocultar"),
      bodyHasContextPanelContent:
        bodyText.includes("Resumo do intake") &&
        (bodyText.includes("Dados mascarados") || bodyText.includes("Sem intake ativo")),
    };
  });
}

async function runViewport(browser, baseUrl, route, token, installedProducts, viewport) {
  const url = new URL(route, baseUrl).toString();
  const baseResult = {
    name: viewport.name,
    width: viewport.width,
    height: viewport.height,
  };
  const reasons = [];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    await page.addInitScript(
      ({ seedToken, installed }) => {
        localStorage.setItem("eiah_token", seedToken);
        localStorage.setItem("installed_products", installed);
      },
      { seedToken: token, installed: installedProducts },
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(
      () =>
        !!document.querySelector("textarea") ||
        !!document.querySelector('[role="tablist"][aria-label="Seletor de vertical"]') ||
        (document.body.textContent ?? "").includes("Resumo do intake"),
      { timeout: 15000 },
    );

    const closedState = await collectClosedState(page, viewport);
    const result = {
      ...baseResult,
      pageUrl: page.url(),
      clientWidth: closedState.clientWidth,
      scrollWidth: closedState.scrollWidth,
      horizontalOverflow: closedState.horizontalOverflow,
      composerVisible: closedState.composerVisible,
      selectorPresent: closedState.selectorPresent,
      selectorOverflow: closedState.selectorOverflow,
      toggleVisible: closedState.toggleVisible,
      toggleOpenOk: false,
      hasContextBadge: closedState.hasContextBadge,
      hasPilotCopy: closedState.hasPilotCopy,
      hasMainContent: closedState.hasMainContent,
      ok: false,
      reasons,
    };

    if (!result.pageUrl.endsWith(route)) {
      reasons.push(`unexpected_url:${result.pageUrl}`);
    }
    if (closedState.horizontalOverflow) reasons.push("horizontal_overflow");
    if (!closedState.composerVisible) reasons.push("composer_not_visible");
    if (!closedState.selectorPresent) reasons.push("selector_missing");
    if (closedState.selectorOverflow) reasons.push("selector_overflow");
    if (!closedState.hasMainContent) reasons.push("main_content_missing");
    if (!closedState.hasContextBadge) reasons.push("context_badge_missing");
    if (closedState.hasPilotCopy) reasons.push("pilot_copy_present");
    if (!closedState.toggleVisible) reasons.push("toggle_not_visible");

    if (closedState.toggleVisible) {
      const toggle = page.getByRole("button", { name: /Resumo do intake/i }).first();
      await toggle.click();
      await page.waitForFunction(
        () => {
          const bodyText = document.body.textContent ?? "";
          return bodyText.includes("Ocultar") || bodyText.includes("Dados mascarados");
        },
        { timeout: 5000 },
      ).catch(() => {});
      const openState = await collectOpenState(page);
      result.toggleOpenOk =
        openState.toggleOpen &&
        openState.bodyHasContextPanelContent &&
        !openState.horizontalOverflow;
      if (!result.toggleOpenOk) reasons.push("toggle_open_state_invalid");
    }

    result.ok = reasons.length === 0;
    return result;
  } catch (error) {
    return makeViewportFailure(baseResult, [normalizeError(error)]);
  } finally {
    await context.close();
  }
}

async function main() {
  const baseUrl = process.env.F1_FRONT_DOOR_BASE_URL ?? DEFAULT_BASE_URL;
  const route = process.env.F1_FRONT_DOOR_ROUTE ?? DEFAULT_ROUTE;
  const token = process.env.F1_FRONT_DOOR_TOKEN ?? DEFAULT_TOKEN;
  const installedProducts =
    process.env.F1_FRONT_DOOR_INSTALLED_PRODUCTS ?? DEFAULT_INSTALLED_PRODUCTS;

  let browser;
  try {
    const playwright = await loadPlaywright();
    const chromium = playwright.chromium ?? playwright.default?.chromium;
    if (!chromium) {
      throw new Error("Playwright carregado sem chromium disponível.");
    }

    browser = await chromium.launch({ headless: true });
    const viewports = [];
    for (const viewport of VIEWPORTS) {
      viewports.push(
        await runViewport(browser, baseUrl, route, token, installedProducts, viewport),
      );
    }

    const ok = viewports.every((viewport) => viewport.ok);
    const result = {
      ok,
      check: CHECK,
      runnerImport: RUNNER_IMPORT,
      fallbackUsed: FALLBACK_USED,
      baseUrl,
      route,
      viewports,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    const result = {
      ok: false,
      check: CHECK,
      runnerImport: RUNNER_IMPORT,
      fallbackUsed: FALLBACK_USED,
      baseUrl: process.env.F1_FRONT_DOOR_BASE_URL ?? DEFAULT_BASE_URL,
      route: process.env.F1_FRONT_DOOR_ROUTE ?? DEFAULT_ROUTE,
      viewports: [],
      reasons: [normalizeError(error)],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

await main();
