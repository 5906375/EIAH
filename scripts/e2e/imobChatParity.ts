/**
 * Paridade do chat IMOB entre o front door (`/app/chat`) e o chat dedicado
 * (`/app/imob/chat`) — ADR-010, etapa E.
 *
 * Roda as mesmas jornadas críticas nos dois chats, com a stack completa
 * (Postgres + Redis + API + web) já no ar:
 *   1. entrar no IMOB e abrir "Cadastrar proprietário";
 *   2. salvar o proprietário e seguir para "Cadastrar imóvel deste proprietário";
 *   3. salvar o imóvel (proprietário já escolhido) e seguir para "Gerar contrato de locação";
 *   4. salvar a locação e abrir o contrato pré-preenchido pelos cadastros;
 *   5. encerrar a locação pela barra (Locações → Encerrar locação).
 * Cada passo confere o resultado na API. No front door também roda a
 * ativação do IMOB pela conversa (etapa F) num workspace novo.
 * Nenhuma jornada pode criar run.
 *
 * Uso: E2E_API_URL=http://127.0.0.1:58080/api E2E_WEB_URL=http://127.0.0.1:55173 \
 *      pnpm test:e2e-imob-chat-parity
 * Saída: relatório JSON e prints em E2E_ARTIFACT_DIR (padrão .artifacts/imob-chat-parity).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:58080/api").replace(/\/$/, "");
const WEB = (process.env.E2E_WEB_URL ?? "http://127.0.0.1:55173").replace(/\/$/, "");
const ARTIFACTS = path.resolve(process.env.E2E_ARTIFACT_DIR ?? ".artifacts/imob-chat-parity");
const STAMP = Date.now().toString().slice(-6);

type Session = { tenantId: string; workspaceId: string; token: string; installedProducts?: string };
type StepResult = { surface: string; step: string; ok: boolean; error?: string };

async function api<T = any>(session: Session | null, method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session ? { authorization: `Bearer ${session.token}`, "x-tenant-id": session.tenantId, "x-workspace-id": session.workspaceId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${JSON.stringify(json)}`);
  return json as T;
}

/** Tenant/workspace novos, com o IMOB ativado pelo Marketplace (mesmo caminho do produto). */
async function provisionSession(label: string, activateImob: boolean): Promise<Session> {
  const onboarding = await api<{ data: { tenantId: string; workspaceId: string; token: string } }>(null, "POST", "/auth/onboarding", {
    email: `parity-${label}-${STAMP}@e2e.local`,
    name: `Paridade ${label}`,
    orgName: `Paridade ${label} ${STAMP}`,
    mode: "provision",
  });
  const session = { tenantId: onboarding.data.tenantId, workspaceId: onboarding.data.workspaceId, token: onboarding.data.token };
  if (activateImob) {
    await api(session, "POST", "/marketplace/installations/activate", { product: "IMOB" });
    // A interface guarda os produtos instalados no navegador (como depois da ativação pelo Marketplace).
    return { ...session, installedProducts: "IMOB" };
  }
  return session;
}

async function openPage(browser: Browser, session: Session, route: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const runs: string[] = [];
  page.on("request", (request) => {
    if (/\/runs$/.test(request.url()) && request.method() === "POST") runs.push(request.url());
  });
  await page.addInitScript((value: Session) => {
    localStorage.setItem("eiah_token", value.token);
    localStorage.setItem("tenant_id", value.tenantId);
    localStorage.setItem("workspace_id", value.workspaceId);
    if (value.installedProducts) localStorage.setItem("installed_products", value.installedProducts);
  }, session);
  await page.goto(`${WEB}${route}`);
  await page.locator("textarea").first().waitFor({ timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  return { page, runs };
}

const formWith = (page: Page, button: string) =>
  page.locator("div.rounded-xl").filter({ has: page.getByRole("button", { name: button, exact: true }) }).last();
const field = (page: Page, button: string, label: string) =>
  formWith(page, button).locator("div.space-y-1").filter({ has: page.getByText(label, { exact: true }) }).locator("input, select").first();
const pick = async (page: Page, menu: string, item: string) => {
  await page.getByRole("button", { name: new RegExp(`^${menu}`) }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
};
const send = async (page: Page, text: string) => {
  await page.locator("textarea").last().fill(text);
  await page.getByRole("button", { name: /^Enviar$/i }).last().click();
};
const selectContaining = async (page: Page, button: string, label: string, text: string) => {
  await page.waitForFunction(
    (wanted) => [...document.querySelectorAll("option")].some((option) => option.textContent?.includes(wanted)),
    text,
    { timeout: 20000 },
  );
  const select = field(page, button, label);
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value ?? "");
};

async function runSurface(browser: Browser, session: Session, surface: "/app/imob/chat" | "/app/chat", results: StepResult[]) {
  const { page, runs } = await openPage(browser, session, surface);
  const tag = surface === "/app/chat" ? "FD" : "IC";
  const ownerName = `Dona Paridade ${tag} ${STAMP}`;
  const unit = `Kit ${tag} ${STAMP}`;
  const shot = (name: string) => page.screenshot({ path: path.join(ARTIFACTS, `${tag}-${name}.png`), fullPage: true }).catch(() => undefined);
  let stop = false;
  const step = async (name: string, fn: () => Promise<void>) => {
    if (stop) {
      results.push({ surface, step: name, ok: false, error: "não executado (passo anterior falhou)" });
      return;
    }
    try {
      await fn();
      results.push({ surface, step: name, ok: true });
    } catch (error) {
      stop = true;
      await shot(`FAIL-${name.replace(/\W+/g, "-")}`);
      results.push({ surface, step: name, ok: false, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    }
  };

  await step("abrir Cadastrar proprietário", async () => {
    if (surface === "/app/chat") {
      if (await page.getByRole("button", { name: /^Proprietários/ }).count()) throw new Error("barra do IMOB visível antes do handoff");
      await send(page, "quero cadastrar um proprietário");
      await page.getByText("Sigo com o IMOB nesta conversa", { exact: false }).first().waitFor({ timeout: 30000 });
    } else {
      await pick(page, "Proprietários", "Cadastrar proprietário");
    }
    await field(page, "Salvar cadastro", "Nome completo").waitFor({ timeout: 30000 });
  });
  await step("salvar proprietário", async () => {
    await field(page, "Salvar cadastro", "Nome completo").fill(ownerName);
    await formWith(page, "Salvar cadastro").getByRole("button", { name: "Salvar cadastro", exact: true }).click();
    await page.getByText(`Proprietário cadastrado: ${ownerName}`, { exact: false }).last().waitFor({ timeout: 20000 });
    const owners = await api<{ data: { items: Array<{ name: string }> } }>(session, "GET", "/imob/owners");
    if (!owners.data.items.some((owner) => owner.name === ownerName)) throw new Error("proprietário não gravado");
  });
  await step("salvar imóvel do proprietário", async () => {
    await page.getByRole("button", { name: "Cadastrar imóvel deste proprietário" }).last().click();
    await field(page, "Salvar cadastro", "Identificação da unidade").waitFor({ timeout: 30000 });
    await page.waitForFunction(
      (name) => [...document.querySelectorAll("select")].some((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent?.includes(name)),
      ownerName,
      { timeout: 20000 },
    );
    await field(page, "Salvar cadastro", "Tipo").selectOption("kitnet");
    await field(page, "Salvar cadastro", "Finalidade").selectOption("locacao");
    await field(page, "Salvar cadastro", "Identificação da unidade").fill(unit);
    await field(page, "Salvar cadastro", "Cidade").fill("Cidade Paridade");
    await field(page, "Salvar cadastro", "Endereço").fill(`Rua Paridade ${tag}, ${STAMP}`);
    await formWith(page, "Salvar cadastro").getByRole("button", { name: "Salvar cadastro", exact: true }).click();
    await page.getByText(`Imóvel cadastrado: ${unit}`, { exact: false }).last().waitFor({ timeout: 20000 });
  });
  await step("salvar locação e abrir contrato preenchido", async () => {
    await page.getByRole("button", { name: "Gerar contrato de locação" }).last().click();
    await field(page, "Salvar locação", "Nome do inquilino").waitFor({ timeout: 30000 });
    await page.waitForFunction(
      (ref) => [...document.querySelectorAll("select")].some((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent?.includes(ref)),
      unit,
      { timeout: 20000 },
    );
    await field(page, "Salvar locação", "Nome do inquilino").fill(`Inquilino ${tag}`);
    await field(page, "Salvar locação", "Início da locação").fill("01/04/2025");
    await field(page, "Salvar locação", "Fim do contrato").fill("31/03/2026");
    await field(page, "Salvar locação", "Aluguel mensal (R$)").fill("900,00");
    await field(page, "Salvar locação", "Dia do vencimento").fill("10");
    await formWith(page, "Salvar locação").getByRole("button", { name: "Salvar locação", exact: true }).click();
    await formWith(page, "Gerar minuta").waitFor({ timeout: 30000 });
    await page.waitForFunction((name) => [...document.querySelectorAll("input")].some((input) => input.value === name), ownerName, { timeout: 20000 });
    if ((await field(page, "Gerar minuta", "Locatário (nome)").inputValue()) !== `Inquilino ${tag}`) throw new Error("locatário não veio da locação");
    await shot("contrato-preenchido");
  });
  await step("encerrar locação pela barra", async () => {
    await pick(page, "Locações", "Encerrar locação");
    await formWith(page, "Encerrar locação").waitFor({ timeout: 15000 });
    await selectContaining(page, "Encerrar locação", "Imóvel da locação", unit);
    await field(page, "Encerrar locação", "Motivo").selectOption("fim_contrato");
    await formWith(page, "Encerrar locação").getByRole("button", { name: "Encerrar locação", exact: true }).click();
    await page.getByText("O imóvel voltou a vago", { exact: false }).last().waitFor({ timeout: 20000 });
    const properties = await api<{ data: { items: Array<{ id: string; metadata?: { externalPropertyRef?: string } }> } }>(session, "GET", "/imob/properties");
    const property = properties.data.items.find((item) => item.metadata?.externalPropertyRef === unit);
    if (!property) throw new Error("imóvel não encontrado");
    const history = await api<{ data: { items: Array<{ status: string }> } }>(session, "GET", `/imob/rentals/history?propertyId=${property.id}`);
    if (history.data.items.length !== 1 || history.data.items[0].status !== "closed") throw new Error("locação não ficou encerrada no histórico");
  });
  await step("nenhuma run criada", async () => {
    if (runs.length) throw new Error(`${runs.length} run(s) criada(s)`);
  });
  await shot("final");
  await page.close();
}

async function runFrontDoorActivation(browser: Browser, results: StepResult[]) {
  const surface = "/app/chat (ativação)";
  let session: Session;
  try {
    session = await provisionSession("ativacao", false);
  } catch (error) {
    results.push({ surface, step: "workspace sem IMOB", ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  const { page, runs } = await openPage(browser, session, "/app/chat");
  const imobStatus = async () => {
    const registry = await api<{ data: { verticals: Array<{ id: string; status: string }> } }>(session, "GET", "/chat/vertical-registry");
    return registry.data.verticals.find((vertical) => vertical.id === "imob")?.status ?? "missing";
  };
  const record = async (step: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ surface, step, ok: true });
    } catch (error) {
      await page.screenshot({ path: path.join(ARTIFACTS, `ACT-FAIL-${step.replace(/\W+/g, "-")}.png`), fullPage: true }).catch(() => undefined);
      results.push({ surface, step, ok: false, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
      throw error;
    }
  };
  try {
    await record("pedido sem IMOB oferece ativar", async () => {
      if ((await imobStatus()) !== "missing") throw new Error("workspace já tem IMOB");
      await send(page, "quero cadastrar um imóvel");
      await page.getByRole("button", { name: "Ativar o IMOB neste workspace", exact: true }).last().waitFor({ timeout: 30000 });
    });
    await record("proposta não ativa", async () => {
      await send(page, "ativar o imob");
      await page.getByText("Nada muda até você confirmar", { exact: false }).last().waitFor({ timeout: 30000 });
      if ((await imobStatus()) !== "missing") throw new Error("ativou sem confirmação");
    });
    await record("confirmação explícita ativa e segue com o IMOB", async () => {
      await send(page, "Confirmar ativação do IMOB");
      await page.getByText("IMOB ativado neste workspace", { exact: false }).last().waitFor({ timeout: 30000 });
      if ((await imobStatus()) !== "enabled") throw new Error("IMOB não ficou ativo");
      await send(page, "quero cadastrar um imóvel");
      await field(page, "Salvar cadastro", "Identificação da unidade").waitFor({ timeout: 30000 });
      if (runs.length) throw new Error(`${runs.length} run(s) criada(s)`);
    });
  } catch {
    // resultado já registrado
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const results: StepResult[] = [];
  // Em ambientes com Chromium fora do cache do Playwright, informe E2E_CHROMIUM_PATH.
  const browser = await chromium.launch(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {});
  try {
    const session = await provisionSession("imob", true);
    await runSurface(browser, session, "/app/imob/chat", results);
    await runSurface(browser, session, "/app/chat", results);
    await runFrontDoorActivation(browser, results);
  } finally {
    await browser.close();
  }
  const steps = [...new Set(results.filter((r) => !r.surface.includes("ativação")).map((r) => r.step))];
  const parity = steps.map((step) => ({
    step,
    imobChat: results.find((r) => r.surface === "/app/imob/chat" && r.step === step)?.ok ?? false,
    frontDoor: results.find((r) => r.surface === "/app/chat" && r.step === step)?.ok ?? false,
  }));
  const ok = results.every((result) => result.ok);
  const report = { check: "e2e:imob-chat-parity", ok, generatedAt: new Date().toISOString(), parity, results };
  fs.writeFileSync(path.join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
  for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} [${result.surface}] ${result.step}${result.error ? ` — ${result.error}` : ""}`);
  console.log(ok ? "PARIDADE OK" : "PARIDADE COM FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
