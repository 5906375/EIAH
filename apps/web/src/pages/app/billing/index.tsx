import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@/state/sessionStore";
import {
  apiGetShadowExecution,
  apiGetAgentBillingSummary,
  apiGetBillingReconciliationSummary,
  apiGetTenantEconomyOpportunities,
  apiCreateTenantBillingAdjustment,
  apiListShadowExecutions,
  apiPostExperienceAudit,
  apiGetRun,
  apiGetTenantBillingLedger,
  apiGetTenantBillingSummary,
  apiGetTenantBillingWorkspaces,
  apiGetWorkspaceAgentAssignments,
  apiPatchTenantQuotas,
  apiPatchTenantWorkspaceGrant,
  type BillingReconciliationSummary,
  type Run,
  type AgentBillingSummaryItem,
  type OptimizationRecommendation,
  type ShadowExecutionContract,
  type TenantBillingLedgerItem,
  type TenantBillingSummary,
  type TenantBillingWorkspaceItem,
  type WorkspaceAgentAssignmentItem,
} from "@/lib/api";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
};

const formatDateInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

function countShadowExecutionsByStage(items: ShadowExecutionContract[]) {
  return items.reduce<Record<ShadowExecutionContract["currentStage"], number>>(
    (acc, item) => {
      acc[item.currentStage] += 1;
      return acc;
    },
    {
      sandbox: 0,
      preview: 0,
      approval: 0,
      promotion: 0,
      production: 0,
    }
  );
}

type Mode = "user" | "dev";
type Theme = "dark" | "light";
type BillingProfileView = "operacao" | "financeiro" | "executivo";

const randomClient = () => `cliente-${Math.floor(Math.random() * 1000)}`;
const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "workspace-demo";

const createDefaultPayload = (workspaceId: string) =>
  `{
  "type": "billing.soft_threshold.crossed",
  "workspaceId": "${workspaceId}"
}`;

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractImobContextFromRun(run: Run | null) {
  const explicitCaseId = getStringValue(run?.caseId);
  const explicitThreadId = getStringValue(run?.threadId);
  const request = getRecord(run?.request);
  const requestMetadata = getRecord(request?.metadata);
  const requestInput = getRecord(request?.input);
  const meta = getRecord(run?.meta);
  const nestedMeta = getRecord(meta?.metadata);
  const caseId =
    explicitCaseId ??
    getStringValue(request?.caseId) ??
    getStringValue(requestInput?.caseId) ??
    getStringValue(requestMetadata?.caseId) ??
    getStringValue(meta?.caseId) ??
    getStringValue(nestedMeta?.caseId) ??
    null;
  const threadId =
    explicitThreadId ??
    getStringValue(request?.threadId) ??
    getStringValue(requestInput?.threadId) ??
    getStringValue(requestMetadata?.threadId) ??
    getStringValue(meta?.threadId) ??
    getStringValue(nestedMeta?.threadId) ??
    null;
  const conversationId =
    getStringValue(request?.conversationId) ??
    getStringValue(requestMetadata?.conversationId) ??
    getStringValue(meta?.conversationId) ??
    getStringValue(nestedMeta?.conversationId) ??
    null;
  return { caseId, threadId, conversationId };
}

const BillingGuideFooter: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mode, setMode] = useState<Mode>("user");
  const [collapsed, setCollapsed] = useState(false);

  const [usoMensal, setUsoMensal] = useState("2104.50");
  const [softLimit, setSoftLimit] = useState("5000");
  const [hardLimit, setHardLimit] = useState("8000");
  const [consumoOut, setConsumoOut] = useState<string>("");

  const [media7, setMedia7] = useState("107");
  const [forecastOut, setForecastOut] = useState<string>("");

  const [softAlert, setSoftAlert] = useState("5000");
  const [usoAlert, setUsoAlert] = useState("2104.50");
  const [estadoAlert, setEstadoAlert] = useState<"normal" | "alerta">("normal");
  const [hysteresisOut, setHysteresisOut] = useState<string>("");

  const [secret, setSecret] = useState("test");
  const { workspaceId = DEFAULT_WORKSPACE_ID } = useSession();

  const [payloadTouched, setPayloadTouched] = useState(false);
  const [payload, setPayload] = useState(() => createDefaultPayload(workspaceId));
  const [timestamp, setTimestamp] = useState("");
  const [eventId, setEventId] = useState("");
  const [signature, setSignature] = useState("");
  const [curlSnippet, setCurlSnippet] = useState("");

  type ClientRow = { id: string; name: string; soft: string; hard: string };
  const [projectSoft, setProjectSoft] = useState("600000");
  const [projectHard, setProjectHard] = useState("900000");
  const [rows, setRows] = useState<ClientRow[]>([
    { id: "row-acme", name: "acme-corp", soft: "150000", hard: "250000" },
    { id: "row-contoso", name: "contoso", soft: "100000", hard: "200000" },
  ]);
  const [jsonOut, setJsonOut] = useState("");

  const formatBRL = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    []
  );

  const computeConsumption = () => {
    const uso = parseFloat(usoMensal) || 0;
    const hard = parseFloat(hardLimit) || 1;
    const pct = (uso / hard) * 100;
    setConsumoOut(`Consumo atual: ${pct.toFixed(1)}% do hard`);
  };

  const computeForecast = () => {
    const media = parseFloat(media7) || 0;
    setForecastOut(`Previsão 30d: ${formatBRL.format(media * 30)}`);
  };

  const computeHysteresis = () => {
    const soft = parseFloat(softAlert) || 0;
    const uso = parseFloat(usoAlert) || 0;
    const estadoAtual = estadoAlert;
    const liga = 0.7 * soft;
    const desliga = 0.68 * soft;

    let novoEstado = estadoAtual;
    if (estadoAtual === "normal" && uso >= liga) novoEstado = "alerta";
    if (estadoAtual === "alerta" && uso < desliga) novoEstado = "normal";

    setHysteresisOut(
      `Estado: ${estadoAtual} → ${novoEstado} · uso=${formatBRL.format(uso)} · on≥${formatBRL.format(
        liga
      )} · off<${formatBRL.format(desliga)}`
    );
  };

  const uuidv4 = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const rnd = crypto.getRandomValues(new Uint8Array(1))[0];
      const v = c === "x" ? rnd & 0xf : (rnd & 0x3) | 0x8;
      return v.toString(16);
    });

  useEffect(() => {
    if (!payloadTouched) {
      setPayload(createDefaultPayload(workspaceId));
    }
  }, [workspaceId, payloadTouched]);

  const generateHeaders = async () => {
    const textEncoder = new TextEncoder();
    const body = payload.trim();
    const ts = Date.now().toString();
    const eid = uuidv4();
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret || "test"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${ts}.${body}`));
    const hex = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    setTimestamp(ts);
    setEventId(eid);
    setSignature(`sha256=${hex}`);
    setCurlSnippet(
      [
        `curl -i -X POST https://seu-dominio.com/webhooks/billing`,
        `  -H "Content-Type: application/json"`,
        `  -H "X-Timestamp: ${ts}"`,
        `  -H "X-Event-Id: ${eid}"`,
        `  -H "X-Signature: sha256=${hex}"`,
        `  --data '${body.replace(/\n/g, " ")}'`,
      ].join(" \\\n")
    );
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Copie manualmente.");
    }
  };

  const addClientRow = () => {
    setRows((prev) => [...prev, { id: randomClient(), name: randomClient(), soft: "100000", hard: "200000" }]);
  };

  const updateRow = (id: string, field: "name" | "soft" | "hard", value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const buildPatchJson = () => {
    const perClient = Object.fromEntries(
      rows.map((row) => [
        row.name || randomClient(),
        { soft: Number(row.soft) || 0, hard: Number(row.hard) || 0 },
      ])
    );
    const json = JSON.stringify(
      {
        softLimitCents: Number(projectSoft) || 0,
        hardLimitCents: Number(projectHard) || 0,
        perClient,
      },
      null,
      2
    );
    setJsonOut(json);
    return json;
  };

  const guideClass = useMemo(
    () =>
      [
        "bq-wrap",
        theme === "light" ? "bq-theme-light" : "bq-theme-dark",
        mode === "dev" ? "bq-mode-dev" : "bq-mode-user",
      ].join(" "),
    [theme, mode]
  );

  return (
    <section id="billing-guide-footer" className={guideClass} aria-label="Guia Interativo de Billing & Quotas">
      <style>{`
        .bq-wrap{--bg:#0b1220;--panel:#111a2b;--muted:#7f8ea3;--text:#e6eefc;--acc:#3aa0ff;--acc2:#00d4ff;--br:16px;--bd:1px solid rgba(255,255,255,.06);color:var(--text);background:linear-gradient(180deg, rgba(12,19,33,0), rgba(12,19,33,.6));border-radius:var(--br);padding:16px;border:var(--bd);backdrop-filter:blur(6px);margin-top:32px;display:flex;flex-direction:column;gap:16px}
        .bq-theme-light{--bg:#f7f9fc;--panel:#ffffff;--muted:#56637a;--text:#0c1221;--acc:#2b7cff;--acc2:#00bcd4;--bd:1px solid rgba(0,0,0,.08)}
        .bq-theme-dark{--bg:#0b1220;--panel:#111a2b;--muted:#7f8ea3;--text:#e6eefc;--acc:#3aa0ff;--acc2:#00d4ff;--bd:1px solid rgba(255,255,255,.06)}
        .bq-wrap{background:var(--bg)}
        .bq-head{display:flex;align-items:center;justify-content:space-between}
        .bq-actions{display:flex;gap:8px;align-items:center}
        .bq-btn{background:linear-gradient(180deg,var(--acc),var(--acc2));color:#001018;border:none;border-radius:12px;padding:8px 12px;font-weight:700;cursor:pointer}
        .bq-btn:active{transform:translateY(1px)}
        .bq-select{background:#0e1726;color:var(--text);border:var(--bd);border-radius:10px;padding:8px}
        .bq-theme-light .bq-select{background:#f3f7ff}
        .bq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
        .bq-card{background:var(--panel);border:var(--bd);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:12px}
        .bq-card header{display:flex;align-items:center;justify-content:space-between}
        .bq-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .bq-kv div{display:flex;flex-direction:column;gap:6px}
        .bq-kv span{font-size:.85rem;color:var(--muted)}
        input,textarea,select{background:#0e1726;color:var(--text);border:var(--bd);border-radius:10px;padding:8px}
        .bq-theme-light input,.bq-theme-light textarea,.bq-theme-light select{background:#f3f7ff}
        .bq-note{color:var(--muted);font-size:.9rem}
        .bq-pre{background:#0a1322;border:var(--bd);border-radius:10px;padding:10px;overflow:auto;max-height:220px}
        .bq-theme-light .bq-pre{background:#f0f4ff}
        .bq-row{display:flex;align-items:center;gap:8px}
        .bq-out{font-weight:700}
        .bq-details summary{cursor:pointer}
        .bq-table{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:.9rem}
        .bq-table thead th{color:var(--muted);font-weight:600;text-align:left;padding:4px 6px}
        .bq-table tbody td{padding:4px 6px}
        .bq-icon{background:#18233a;color:#fff;border:none;border-radius:8px;padding:6px;cursor:pointer}
        .bq-theme-light .bq-icon{background:#dce4f7;color:#10203d}
        .bq-mode-user [data-mode="dev"]{display:none}
        .bq-mode-dev [data-mode="user"]{display:none}
        @media(max-width:900px){.bq-grid{grid-template-columns:1fr}.bq-kv{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
      <div className="bq-head">
        <h2>Guia Interativo · Billing &amp; Quotas</h2>
        <div className="bq-actions">
          <select
            id="bq-mode"
            className="bq-select"
            title="Modo"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            <option value="user">Usuário final</option>
            <option value="dev">Desenvolvimento</option>
          </select>
          <button
            id="bq-theme"
            className="bq-btn"
            title="Alternar tema"
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          >
            🌓
          </button>
          <button
            id="bq-collapse"
            className="bq-btn"
            title="Recolher/Expandir"
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        </div>
      </div>

      <div id="bq-body" className="bq-grid" style={{ display: collapsed ? "none" : undefined }}>
        <article className="bq-card">
          <header>
            <h3>Visão rápida</h3>
          </header>
          <div className="bq-kv">
            <div>
              <span>Uso mensal</span>
              <input value={usoMensal} onChange={(event) => setUsoMensal(event.target.value)} type="number" step="0.01" />
            </div>
            <div>
              <span>Soft limit</span>
              <input value={softLimit} onChange={(event) => setSoftLimit(event.target.value)} type="number" step="0.01" />
            </div>
            <div>
              <span>Hard limit</span>
              <input value={hardLimit} onChange={(event) => setHardLimit(event.target.value)} type="number" step="0.01" />
            </div>
          </div>
          <div className="bq-row">
            <button className="bq-btn" type="button" onClick={computeConsumption}>
              Calcular consumo
            </button>
            <output className="bq-out">{consumoOut}</output>
          </div>
          <p className="bq-note">
            Regra: consumo atual = uso_mensal / hard_limit. Estimativas pendentes são substituídas por confirmadas (sem
            dupla contagem).
          </p>
        </article>

        <article className="bq-card">
          <header>
            <h3>Previsão (30 dias)</h3>
          </header>
          <div className="bq-kv">
            <div>
              <span>Média diária (últimos 7d)</span>
              <input value={media7} onChange={(event) => setMedia7(event.target.value)} type="number" step="0.01" />
            </div>
          </div>
          <div className="bq-row">
            <button className="bq-btn" type="button" onClick={computeForecast}>
              Projetar
            </button>
            <output className="bq-out">{forecastOut}</output>
          </div>
          <p className="bq-note">
            Sugestão: usar média móvel 7d com <em>winsorization</em> e histerese de alertas 70%/68% do soft.
          </p>
        </article>

        <article className="bq-card">
          <header>
            <h3>Alertas &amp; Histerese 70% / 68%</h3>
          </header>
          <div className="bq-kv">
            <div>
              <span>Soft limit</span>
              <input value={softAlert} onChange={(event) => setSoftAlert(event.target.value)} type="number" step="0.01" />
            </div>
            <div>
              <span>Uso mensal</span>
              <input value={usoAlert} onChange={(event) => setUsoAlert(event.target.value)} type="number" step="0.01" />
            </div>
            <div>
              <span>Estado atual</span>
              <select value={estadoAlert} onChange={(event) => setEstadoAlert(event.target.value as "normal" | "alerta")}>
                <option value="normal">normal</option>
                <option value="alerta">alerta</option>
              </select>
            </div>
          </div>
          <div className="bq-row">
            <button className="bq-btn" type="button" onClick={computeHysteresis}>
              Checar estado
            </button>
            <output className="bq-out">{hysteresisOut}</output>
          </div>
          <details className="bq-details">
            <summary>Como funciona</summary>
            <ul>
              <li>Dispara alerta quando uso ≥ 70% do soft.</li>
              <li>Só volta a normal quando uso &lt; 68% do soft.</li>
            </ul>
          </details>
        </article>

        <article className="bq-card" data-mode="dev">
          <header>
            <h3>Webhook tester (HMAC)</h3>
          </header>
          <label className="bq-label">Segredo (teste local — não use o real em produção)</label>
          <input value={secret} onChange={(event) => setSecret(event.target.value)} type="password" placeholder="ex.: test" />

          <label className="bq-label">Payload (JSON)</label>
          <textarea
            value={payload}
            onChange={(event) => {
              setPayloadTouched(true);
              setPayload(event.target.value);
            }}
            rows={6}
          />

          <div className="bq-kv">
            <div>
              <span>X-Timestamp</span>
              <input value={timestamp} readOnly placeholder="auto" />
            </div>
            <div>
              <span>X-Event-Id</span>
              <input value={eventId} readOnly placeholder="auto" />
            </div>
            <div>
              <span>X-Signature</span>
              <input value={signature} readOnly placeholder="sha256=..." />
            </div>
          </div>
          <div className="bq-row">
            <button className="bq-btn" type="button" onClick={generateHeaders}>
              Gerar headers
            </button>
            <button
              className="bq-btn"
              type="button"
              onClick={() => curlSnippet && copyToClipboard(curlSnippet)}
            >
              Copiar cURL
            </button>
          </div>
          <p className="bq-note">
            Assinatura: <code>sha256(secret, ts + "." + rawBody)</code>. Verifique HMAC, timestamp ≤ 5 min e dedupe por{" "}
            <code>X-Event-Id</code>.
          </p>
          <pre className="bq-pre" aria-live="polite">
            {curlSnippet}
          </pre>
        </article>

        <article className="bq-card" data-mode="user">
          <header>
            <h3>Quotas — Guia do Usuário</h3>
          </header>
          <p>
            Os limites de consumo do projeto são definidos pelo time administrador. Ao atingir o <strong>soft limit</strong>,
            algumas funções podem ser limitadas. No <strong>hard limit</strong>, novas execuções são bloqueadas.
          </p>
          <ul>
            <li>
              <strong>O que você pode fazer:</strong> revise o consumo, use <em>Simular primeiro</em> e solicite aumento de cota
              se necessário.
            </li>
            <li>
              <strong>Transparência:</strong> acompanhe consumo, previsão 30 dias e status de alertas no painel.
            </li>
            <li>
              <strong>Suporte:</strong> utilize “Solicitar aumento” para abrir um ticket quando estiver bloqueado.
            </li>
          </ul>
        </article>

        <article className="bq-card" data-mode="dev">
          <header>
            <h3>Quotas customizadas</h3>
          </header>
          <div className="bq-kv">
            <div>
              <span>Projeto (soft)</span>
              <input value={projectSoft} onChange={(event) => setProjectSoft(event.target.value)} type="number" />
            </div>
            <div>
              <span>Projeto (hard)</span>
              <input value={projectHard} onChange={(event) => setProjectHard(event.target.value)} type="number" />
            </div>
          </div>
          <table className="bq-table" aria-label="Limites por cliente">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Soft</th>
                <th>Hard</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input value={row.name} onChange={(event) => updateRow(row.id, "name", event.target.value)} />
                  </td>
                  <td>
                    <input value={row.soft} type="number" onChange={(event) => updateRow(row.id, "soft", event.target.value)} />
                  </td>
                  <td>
                    <input value={row.hard} type="number" onChange={(event) => updateRow(row.id, "hard", event.target.value)} />
                  </td>
                  <td>
                    <button className="bq-icon" type="button" aria-label="remover" onClick={() => removeRow(row.id)}>
                      ✖
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bq-row">
            <button className="bq-btn" type="button" onClick={addClientRow}>
              Adicionar cliente
            </button>
            <button className="bq-btn" type="button" onClick={buildPatchJson}>
              Gerar PATCH
            </button>
            <button
              className="bq-btn"
              type="button"
              onClick={() => copyToClipboard(jsonOut || buildPatchJson())}
            >
              Copiar JSON
            </button>
          </div>
          <pre className="bq-pre" aria-live="polite">
            {jsonOut}
          </pre>
        </article>
      </div>
    </section>
  );
};

const BillingPage: React.FC = () => {
  const { workspaceId, activeDomain, experience } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRunId = (searchParams.get("runId") || "").trim() || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TenantBillingSummary | null>(null);
  const [economyOpportunitySnapshot, setEconomyOpportunitySnapshot] = useState<
    TenantBillingSummary["economyOpportunitySnapshot"] | null
  >(null);
  const [workspaceItems, setWorkspaceItems] = useState<TenantBillingWorkspaceItem[]>([]);
  const [workspaceAgentsByWorkspaceId, setWorkspaceAgentsByWorkspaceId] = useState<
    Record<string, WorkspaceAgentAssignmentItem[]>
  >({});
  const [ledgerItems, setLedgerItems] = useState<TenantBillingLedgerItem[]>([]);
  const [reconciliation, setReconciliation] = useState<BillingReconciliationSummary | null>(null);
  const [reconciliationWorkspaceId, setReconciliationWorkspaceId] = useState<string>("");
  const [reconciliationAgent, setReconciliationAgent] = useState<string>("");
  const [reconciliationAgents, setReconciliationAgents] = useState<AgentBillingSummaryItem[]>([]);
  const [requestedRun, setRequestedRun] = useState<Run | null>(null);
  const [shadowExecutions, setShadowExecutions] = useState<ShadowExecutionContract[]>([]);
  const [shadowExecutionsStatus, setShadowExecutionsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [shadowExecutionsError, setShadowExecutionsError] = useState<string | null>(null);
  const [shadowCurrentStageFilter, setShadowCurrentStageFilter] = useState<ShadowExecutionContract["currentStage"] | "all">("all");
  const [shadowApprovalStatusFilter, setShadowApprovalStatusFilter] = useState<ShadowExecutionContract["approvalStatus"] | "all">("all");
  const [shadowAgentFilter, setShadowAgentFilter] = useState("");
  const [expandedShadowExecutionId, setExpandedShadowExecutionId] = useState<string | null>(null);
  const [shadowExecutionDetail, setShadowExecutionDetail] = useState<ShadowExecutionContract | null>(null);
  const [shadowExecutionDetailStatus, setShadowExecutionDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [shadowExecutionDetailError, setShadowExecutionDetailError] = useState<string | null>(null);
  const [billingProfile, setBillingProfile] = useState<BillingProfileView>("operacao");
  const [periodFromInput, setPeriodFromInput] = useState("");
  const [periodToInput, setPeriodToInput] = useState("");
  const [periodFromApplied, setPeriodFromApplied] = useState("");
  const [periodToApplied, setPeriodToApplied] = useState("");
  const [isInvestigationMode, setIsInvestigationMode] = useState(Boolean(requestedRunId));

  const [quotaForm, setQuotaForm] = useState({
    softLimitPct: "",
    hardLimitPct: "",
    monthlyRunsLimit: "",
    monthlyCostCentsLimit: "",
  });
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  const [grantSavingId, setGrantSavingId] = useState<string | null>(null);

  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [adjustmentWorkspaceId, setAdjustmentWorkspaceId] = useState<string>("");
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, workspacesRes, ledgerRes, reconciliationRes, agentSummaryRes, economyRes] = await Promise.all([
        apiGetTenantBillingSummary({
          from: periodFromApplied || undefined,
          to: periodToApplied || undefined,
        }),
        apiGetTenantBillingWorkspaces(),
        apiGetTenantBillingLedger({
          limit: 12,
          from: periodFromApplied || undefined,
          to: periodToApplied || undefined,
          workspaceId: reconciliationWorkspaceId || undefined,
        }),
        apiGetBillingReconciliationSummary({
          limit: 12,
          workspaceId: reconciliationWorkspaceId || undefined,
          runId: requestedRunId || undefined,
          agent: reconciliationAgent || undefined,
          from: periodFromApplied || undefined,
          to: periodToApplied || undefined,
        }),
        apiGetAgentBillingSummary({
          workspaceId: reconciliationWorkspaceId || undefined,
          from: periodFromApplied || undefined,
          to: periodToApplied || undefined,
        }).catch(() => null),
        apiGetTenantEconomyOpportunities().catch(() => null),
      ]);
      const workspaceData = workspacesRes.data.items || [];
      const activeWorkspaceItem = workspaceData.find((item) => item.isActiveWorkspace);
      const workspaceAgentsEntries = await Promise.all(
        workspaceData.map(async (item) => {
          const response = await apiGetWorkspaceAgentAssignments(item.workspaceId).catch(() => null);
          return [item.workspaceId, response?.data?.items ?? []] as const;
        })
      );
      setSummary(summaryRes.data);
      setEconomyOpportunitySnapshot(economyRes?.data ?? summaryRes.data.economyOpportunitySnapshot ?? null);
      setWorkspaceItems(workspaceData);
      setWorkspaceAgentsByWorkspaceId(Object.fromEntries(workspaceAgentsEntries));
      setLedgerItems(ledgerRes.data.items || []);
      setReconciliation(reconciliationRes.data);
      setReconciliationAgents(Array.isArray(agentSummaryRes?.data?.items) ? agentSummaryRes.data.items : []);

      const policy = summaryRes.data.policy;
      setQuotaForm({
        softLimitPct: policy?.softLimitPct != null ? String(policy.softLimitPct) : "",
        hardLimitPct: policy?.hardLimitPct != null ? String(policy.hardLimitPct) : "",
        monthlyRunsLimit: policy?.monthlyRunsLimit != null ? String(policy.monthlyRunsLimit) : "",
        monthlyCostCentsLimit:
          policy?.monthlyCostCentsLimit != null ? String(policy.monthlyCostCentsLimit) : "",
      });

      setAdjustmentWorkspaceId((current) =>
        current && workspaceData.some((item) => item.workspaceId === current)
          ? current
          : activeWorkspaceItem?.workspaceId ?? workspaceData[0]?.workspaceId ?? ""
      );
      setReconciliationWorkspaceId((current) =>
        current && workspaceData.some((item) => item.workspaceId === current)
          ? current
          : ""
      );
      setReconciliationAgent((current) =>
        current && (agentSummaryRes?.data?.items ?? []).some((item) => item.agent === current)
          ? current
          : ""
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar billing do tenant.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadShadowExecutions = useCallback(async () => {
    if (!workspaceId) {
      setShadowExecutions([]);
      setShadowExecutionsStatus("ready");
      setShadowExecutionsError(null);
      return;
    }
    setShadowExecutionsStatus("loading");
    setShadowExecutionsError(null);
    try {
      const response = await apiListShadowExecutions({
        workspaceId,
        limit: 5,
        currentStage: shadowCurrentStageFilter === "all" ? undefined : shadowCurrentStageFilter,
        approvalStatus: shadowApprovalStatusFilter === "all" ? undefined : shadowApprovalStatusFilter,
        agentId: shadowAgentFilter.trim() || undefined,
      });
      setShadowExecutions(response.data.items ?? []);
      setShadowExecutionsStatus("ready");
    } catch (err) {
      setShadowExecutions([]);
      setShadowExecutionsStatus("error");
      setShadowExecutionsError(
        err instanceof Error ? err.message : "Falha ao carregar shadow executions persistidas."
      );
    }
  }, [shadowAgentFilter, shadowApprovalStatusFilter, shadowCurrentStageFilter, workspaceId]);

  const inspectShadowExecution = useCallback(async (shadowExecutionId: string) => {
    if (expandedShadowExecutionId === shadowExecutionId) {
      setExpandedShadowExecutionId(null);
      setShadowExecutionDetail(null);
      setShadowExecutionDetailStatus("idle");
      setShadowExecutionDetailError(null);
      return;
    }
    setExpandedShadowExecutionId(shadowExecutionId);
    setShadowExecutionDetail(null);
    setShadowExecutionDetailStatus("loading");
    setShadowExecutionDetailError(null);
    try {
      const response = await apiGetShadowExecution(shadowExecutionId);
      setShadowExecutionDetail(response.data);
      setShadowExecutionDetailStatus("ready");
    } catch (err) {
      setShadowExecutionDetail(null);
      setShadowExecutionDetailStatus("error");
      setShadowExecutionDetailError(
        err instanceof Error ? err.message : "Falha ao carregar snapshot completo."
      );
    }
  }, [expandedShadowExecutionId]);

  useEffect(() => {
    void loadData();
  }, [workspaceId, reconciliationWorkspaceId, reconciliationAgent, requestedRunId, periodFromApplied, periodToApplied]);

  useEffect(() => {
    if (!requestedRunId) {
      setRequestedRun(null);
      return;
    }
    let cancelled = false;
    void apiGetRun(requestedRunId)
      .then((run) => {
        if (!cancelled) setRequestedRun(run);
      })
      .catch(() => {
        if (!cancelled) setRequestedRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedRunId]);

  const requestedRunImobContext = useMemo(() => extractImobContextFromRun(requestedRun), [requestedRun]);
  const requestedRunImobHref = useMemo(() => {
    if (!requestedRunImobContext.caseId && !requestedRunImobContext.threadId) return null;
    const params = new URLSearchParams();
    if (requestedRunImobContext.caseId) params.set("caseId", requestedRunImobContext.caseId);
    if (requestedRunImobContext.threadId) params.set("threadId", requestedRunImobContext.threadId);
    if (requestedRunImobContext.conversationId) params.set("conversationId", requestedRunImobContext.conversationId);
    if (requestedRunId) params.set("returnTo", `/app/billing?runId=${encodeURIComponent(requestedRunId)}`);
    const query = params.toString();
    return query ? `/app/imob/chat?${query}` : null;
  }, [requestedRunId, requestedRunImobContext]);
  const billingInvestigationReasons = useMemo(() => {
    const reasons: string[] = [];
    if (requestedRunId) reasons.push("run_deeplink");
    if (reconciliationWorkspaceId) reasons.push("workspace_filter");
    if (reconciliationAgent) reasons.push("agent_filter");
    return reasons;
  }, [reconciliationAgent, reconciliationWorkspaceId, requestedRunId]);
  const auditInvestigationMode = useCallback(
    (action: "entered" | "exited" | "changed", nextMode: boolean, reasonCodes: string[]) => {
      void apiPostExperienceAudit(
        {
          surfaceId: "billing",
          action,
          fromMode: nextMode ? "standard" : "investigation",
          toMode: nextMode ? "investigation" : "standard",
          reasonCodes,
          metadata: {
            requestedRunId,
            reconciliationWorkspaceId: reconciliationWorkspaceId || null,
            reconciliationAgent: reconciliationAgent || null,
          },
        },
        activeDomain === "imob" ? "imob" : "core"
      ).catch(() => undefined);
    },
    [activeDomain, reconciliationAgent, reconciliationWorkspaceId, requestedRunId]
  );
  useEffect(() => {
    if (billingInvestigationReasons.length === 0) return;
    if (!isInvestigationMode) {
      setIsInvestigationMode(true);
      auditInvestigationMode("entered", true, billingInvestigationReasons);
      return;
    }
    auditInvestigationMode("changed", true, billingInvestigationReasons);
  }, [auditInvestigationMode, billingInvestigationReasons, isInvestigationMode]);

  const percent = useMemo(() => {
    if (!summary?.policy?.monthlyCostCentsLimit || summary.policy.monthlyCostCentsLimit <= 0) return 0;
    return Math.min(100, (summary.totals.costCents / summary.policy.monthlyCostCentsLimit) * 100);
  }, [summary]);

  const forecastNextCents = useMemo(() => {
    const current = summary?.totals.costCents ?? 0;
    return Math.round(current * 1.3);
  }, [summary]);

  const planSummary = summary?.plan ?? null;
  const entitlementSummary = summary?.entitlements ?? null;
  const workspaceCostOverview = summary?.costOverview?.workspaceConsumption ?? null;
  const auditableCostOverview = summary?.costOverview?.auditableCost ?? null;
  const roleProfile = experience?.roleProfile ?? "workspace_member";
  const isBillingAdminView =
    roleProfile === "workspace_admin" ||
    roleProfile === "tenant_admin" ||
    roleProfile === "founder_global" ||
    roleProfile === "service_operator";
  const operationalInsightSnapshot = summary?.operationalInsightSnapshot ?? null;
  const effectiveEconomyOpportunitySnapshot =
    economyOpportunitySnapshot ?? summary?.economyOpportunitySnapshot ?? null;
  const optimizationRecommendations = summary?.optimizationRecommendations?.items ?? [];
  const topOptimizationRecommendations = optimizationRecommendations.slice(0, 3);
  const shadowExecutionsByStage = useMemo(
    () => countShadowExecutionsByStage(shadowExecutions),
    [shadowExecutions]
  );

  useEffect(() => {
    if (!isBillingAdminView) return;
    void loadShadowExecutions();
  }, [isBillingAdminView, loadShadowExecutions]);

  const activeWorkspace = workspaceItems.find((item) => item.isActiveWorkspace);
  const selectedWorkspace =
    (reconciliationWorkspaceId
      ? workspaceItems.find((item) => item.workspaceId === reconciliationWorkspaceId)
      : null) ??
    activeWorkspace ??
    workspaceItems[0] ??
    null;
  const enabledGrantCount = workspaceItems.filter((item) => item.grant?.enabled !== false).length;
  const disabledGrantCount = workspaceItems.filter((item) => item.grant?.enabled === false).length;
  const workspaceAgentCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(workspaceAgentsByWorkspaceId).map(([workspaceId, items]) => [
          workspaceId,
          {
            total: items.length,
            enabled: items.filter((item) => item.enabled).length,
          },
        ])
      ) as Record<string, { total: number; enabled: number }>,
    [workspaceAgentsByWorkspaceId]
  );
  const totalEnabledWorkspaceAgents = useMemo(
    () =>
      Object.values(workspaceAgentsByWorkspaceId).reduce(
        (sum, items) => sum + items.filter((item) => item.enabled).length,
        0
      ),
    [workspaceAgentsByWorkspaceId]
  );
  const workspacesWithEnabledAgents = useMemo(
    () => Object.values(workspaceAgentCounts).filter((item) => item.enabled > 0).length,
    [workspaceAgentCounts]
  );
  const selectedWorkspaceAgents = useMemo(() => {
    if (!selectedWorkspace?.workspaceId) return [];
    return workspaceAgentsByWorkspaceId[selectedWorkspace.workspaceId] ?? [];
  }, [selectedWorkspace, workspaceAgentsByWorkspaceId]);
  const workspaceShare = useMemo(() => {
    const total = summary?.totals.costCents ?? 0;
    const workspaceCost = selectedWorkspace?.usage.costCents ?? 0;
    if (total <= 0) return 0;
    return Math.min(100, (workspaceCost / total) * 100);
  }, [selectedWorkspace, summary]);
  const ledgerSummary = useMemo(() => {
    const withRun = ledgerItems.filter((item) => item.runId).length;
    const withoutRun = ledgerItems.length - withRun;
    const totalAmountCents = ledgerItems.reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
    return {
      totalItems: ledgerItems.length,
      withRun,
      withoutRun,
      totalAmountCents,
    };
  }, [ledgerItems]);
  const topWorkspace = useMemo(() => {
    const items = [...(summary?.byWorkspace ?? [])];
    items.sort((a, b) => b.costCents - a.costCents);
    return items[0] ?? null;
  }, [summary]);
  const executiveSummary = useMemo(() => {
    const total = summary?.totals.costCents ?? 0;
    const estimatedInvoice = entitlementSummary?.estimatedInvoiceCents ?? 0;
    const auditGaps = reconciliation?.totals.auditGapCount ?? 0;
    const ledgerGaps = reconciliation?.totals.ledgerGapCount ?? 0;

    if (billingProfile === "financeiro") {
      return {
        title: "Resumo financeiro",
        lines: [
          `Faturamento previsto do ciclo: ${formatBRL(estimatedInvoice)}.`,
          `Custo consolidado no ledger: ${formatBRL(total)}.`,
          `Pendências abertas: ${ledgerGaps} ledger gaps e ${auditGaps} audit gaps.`,
        ],
      };
    }
    if (billingProfile === "executivo") {
      return {
        title: "Resumo executivo",
        lines: [
          `Tenant em ${formatBRL(total)} no ciclo atual.`,
          `Workspace mais custoso: ${topWorkspace?.workspaceName ?? "-"} com ${formatBRL(topWorkspace?.costCents ?? 0)}.`,
          `Risco operacional atual: ${auditGaps + ledgerGaps} ocorrências relevantes.`,
        ],
      };
    }
    return {
      title: "Resumo operacional",
      lines: [
        `${summary?.totals.runs ?? 0} runs consolidados e ${formatBRL(total)} em custo.`,
        `Workspace em foco: ${selectedWorkspace?.workspaceName ?? "-"} com ${selectedWorkspace?.usage.runs ?? 0} runs.`,
        `Reconciliação aberta: ${auditGaps} audit gaps e ${ledgerGaps} ledger gaps.`,
      ],
    };
  }, [billingProfile, entitlementSummary, reconciliation, selectedWorkspace, summary, topWorkspace]);

  const onSaveQuotas = async () => {
    setQuotaSaving(true);
    setQuotaMessage(null);
    try {
      await apiPatchTenantQuotas({
        softLimitPct: quotaForm.softLimitPct ? Number(quotaForm.softLimitPct) : undefined,
        hardLimitPct: quotaForm.hardLimitPct ? Number(quotaForm.hardLimitPct) : undefined,
        monthlyRunsLimit: quotaForm.monthlyRunsLimit ? Number(quotaForm.monthlyRunsLimit) : undefined,
        monthlyCostCentsLimit: quotaForm.monthlyCostCentsLimit
          ? Number(quotaForm.monthlyCostCentsLimit)
          : undefined,
      });
      setQuotaMessage("Quotas atualizadas.");
      await loadData();
    } catch (err) {
      setQuotaMessage(err instanceof Error ? err.message : "Falha ao salvar quotas.");
    } finally {
      setQuotaSaving(false);
    }
  };

  const onToggleWorkspaceGrant = async (item: TenantBillingWorkspaceItem) => {
    setGrantSavingId(item.workspaceId);
    try {
      await apiPatchTenantWorkspaceGrant(item.workspaceId, {
        enabled: item.grant?.enabled === false ? true : false,
      });
      await loadData();
    } finally {
      setGrantSavingId(null);
    }
  };

  const onCreateAdjustment = async () => {
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setAdjustmentMessage("Informe um valor (centavos) diferente de zero.");
      return;
    }
    setAdjustmentSaving(true);
    setAdjustmentMessage(null);
    try {
      await apiCreateTenantBillingAdjustment({
        amountCents: amount,
        workspaceId: adjustmentWorkspaceId || undefined,
        description: adjustmentDescription || undefined,
      });
      setAdjustmentAmount("");
      setAdjustmentDescription("");
      setAdjustmentMessage("Adjustment registrado no ledger.");
      await loadData();
    } catch (err) {
      setAdjustmentMessage(err instanceof Error ? err.message : "Falha ao criar adjustment.");
    } finally {
      setAdjustmentSaving(false);
    }
  };

  const onApplyPeriodFilter = () => {
    setPeriodFromApplied(periodFromInput);
    setPeriodToApplied(periodToInput);
  };

  const onClearPeriodFilter = () => {
    setPeriodFromInput("");
    setPeriodToInput("");
    setPeriodFromApplied("");
    setPeriodToApplied("");
  };

  const onExportReconciliation = () => {
    if (!reconciliation) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: billingProfile,
      filters: {
        workspaceId: reconciliationWorkspaceId || null,
        agent: reconciliationAgent || null,
        runId: requestedRunId || null,
        from: periodFromApplied || null,
        to: periodToApplied || null,
      },
      summary: {
        tenantId: summary?.tenantId ?? null,
        cycleStart: summary?.cycleStart ?? null,
        cycleEnd: summary?.cycleEnd ?? null,
        totalRuns: summary?.totals.runs ?? 0,
        totalCostCents: summary?.totals.costCents ?? 0,
      },
      divergences: reconciliation.items.auditGaps,
      duplicateCharges: reconciliation.items.duplicateCharges,
      ledgerGaps: reconciliation.items.ledgerGaps,
      orphanUsage: reconciliation.items.orphanUsage,
      totals: reconciliation.totals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `billing-divergencias-${summary?.tenantId ?? "tenant"}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onExportLedger = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      filters: {
        workspaceId: reconciliationWorkspaceId || null,
        from: periodFromApplied || null,
        to: periodToApplied || null,
      },
      totals: ledgerSummary,
      items: ledgerItems,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `billing-ledger-${summary?.tenantId ?? "tenant"}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="grid gap-8">
      <section className="glass-panel p-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Billing & quotas</p>
            <h2 className="text-3xl font-display font-semibold text-foreground">Controle financeiro</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Mantenha limites saudaveis por projeto e aprove licencas antes da operacao atingir o hard limit.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              value={billingProfile}
              onChange={(event) => setBillingProfile(event.target.value as BillingProfileView)}
            >
              <option value="operacao">Perfil operação</option>
              <option value="financeiro">Perfil financeiro</option>
              <option value="executivo">Perfil executivo</option>
            </select>
            <span className="pill">
              {loading ? "Carregando..." : `Tenant: ${summary?.tenantId ?? "-"}`}
            </span>
          </div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.6fr,0.4fr]">
          <div className="glass-subtle space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-accent">Filtro por período</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Aplica o mesmo recorte em summary, ledger e reconciliação.
                </p>
              </div>
              {(periodFromApplied || periodToApplied) ? (
                <span className="pill">
                  {periodFromApplied || formatDateInputValue(summary?.cycleStart)} até{" "}
                  {periodToApplied || formatDateInputValue(summary?.cycleEnd)}
                </span>
              ) : (
                <span className="pill">Ciclo ativo</span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto,auto]">
              <input
                type="date"
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                value={periodFromInput}
                onChange={(event) => setPeriodFromInput(event.target.value)}
              />
              <input
                type="date"
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                value={periodToInput}
                onChange={(event) => setPeriodToInput(event.target.value)}
              />
              <button
                type="button"
                className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent"
                onClick={onApplyPeriodFilter}
              >
                Aplicar
              </button>
              <button
                type="button"
                className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
                onClick={onClearPeriodFilter}
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="glass-subtle space-y-3 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-accent">{executiveSummary.title}</p>
            <ul className="space-y-2 text-sm text-foreground">
              {executiveSummary.lines.map((line) => (
                <li key={line} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="glass-subtle space-y-2 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Consumo do tenant</p>
            <p className="text-2xl font-semibold text-foreground">{formatBRL(summary?.totals.costCents ?? 0)}</p>
            <p className="text-xs text-muted-foreground">
              {summary?.totals.runs ?? 0} runs no ciclo ativo
            </p>
          </div>
          <div className="glass-subtle space-y-2 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {reconciliationWorkspaceId ? "Consumo do workspace filtrado" : "Consumo do workspace ativo"}
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {formatBRL(selectedWorkspace?.usage.costCents ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedWorkspace?.workspaceName ?? "-"} · {workspaceShare.toFixed(1)}% do tenant
            </p>
          </div>
          <div className="glass-subtle space-y-2 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ledger gaps</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.ledgerGapCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              ledgerRows: {reconciliation?.totals.ledgerRows ?? 0}
            </p>
          </div>
          <div className="glass-subtle space-y-2 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Audit gaps</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.auditGapCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              runsChecked: {reconciliation?.totals.runsChecked ?? 0}
            </p>
          </div>
        </div>

        {(workspaceCostOverview || auditableCostOverview) ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {workspaceCostOverview ? (
              <div className="glass-subtle space-y-2 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-accent">{workspaceCostOverview.title}</p>
                <p className="text-2xl font-semibold text-foreground">{formatBRL(workspaceCostOverview.amountCents)}</p>
                <p className="text-xs text-muted-foreground">{workspaceCostOverview.summary}</p>
              </div>
            ) : null}
            {auditableCostOverview ? (
              <div className="glass-subtle space-y-2 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-accent">{auditableCostOverview.title}</p>
                <p className="text-2xl font-semibold text-foreground">{formatBRL(auditableCostOverview.amountCents)}</p>
                <p className="text-xs text-muted-foreground">{auditableCostOverview.summary}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {isBillingAdminView ? (
          <div className="mt-6 glass-subtle space-y-4 p-5">
            {operationalInsightSnapshot ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-accent">Operational insight</p>
                    <p className="mt-1 text-sm text-muted-foreground">{operationalInsightSnapshot.summary}</p>
                  </div>
                  <span className="pill">{operationalInsightSnapshot.priority}</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{operationalInsightSnapshot.recommendedFocus}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Friction total</p>
                    <p className="mt-2 text-sm text-foreground">{operationalInsightSnapshot.frictionTotal}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Optimization total</p>
                    <p className="mt-2 text-sm text-foreground">{operationalInsightSnapshot.optimizationTotal}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top friction</p>
                    <p className="mt-2 text-xs text-foreground">
                      {operationalInsightSnapshot.topFrictionKind ?? "—"} /{" "}
                      {operationalInsightSnapshot.topFrictionSurface ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Top optimization</p>
                    <p className="mt-2 text-xs text-foreground">
                      {operationalInsightSnapshot.topOptimizationType ?? "—"} /{" "}
                      {operationalInsightSnapshot.topOptimizationWorkspace ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-accent">Shadow executions</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Inspeção leve dos previews e promoções persistidos do workspace ativo.
                  </p>
                </div>
                <span className="pill">{workspaceId ?? "workspace-demo"}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-xs text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Current stage</span>
                  <select
                    value={shadowCurrentStageFilter}
                    onChange={(event) =>
                      setShadowCurrentStageFilter(
                        event.target.value as ShadowExecutionContract["currentStage"] | "all"
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                  >
                    <option value="all">Todos</option>
                    <option value="sandbox">sandbox</option>
                    <option value="preview">preview</option>
                    <option value="approval">approval</option>
                    <option value="promotion">promotion</option>
                    <option value="production">production</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval status</span>
                  <select
                    value={shadowApprovalStatusFilter}
                    onChange={(event) =>
                      setShadowApprovalStatusFilter(
                        event.target.value as ShadowExecutionContract["approvalStatus"] | "all"
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                  >
                    <option value="all">Todos</option>
                    <option value="not_required">not_required</option>
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Agent</span>
                  <input
                    value={shadowAgentFilter}
                    onChange={(event) => setShadowAgentFilter(event.target.value)}
                    placeholder="Filtrar por agentId"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1527] px-3 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
              {shadowExecutions.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {(["sandbox", "preview", "approval", "promotion", "production"] as const).map((stage) => (
                    <div key={stage} className="rounded-lg border border-white/10 bg-[#0a1527] p-3 text-xs text-muted-foreground">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">{stage}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{shadowExecutionsByStage[stage]}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {shadowExecutionsStatus === "loading" ? (
                <p className="mt-4 text-sm text-muted-foreground">Carregando snapshots persistidos...</p>
              ) : shadowExecutionsStatus === "error" ? (
                <p className="mt-4 text-sm text-rose-300">
                  {shadowExecutionsError ?? "Falha ao carregar shadow executions persistidas."}
                </p>
              ) : shadowExecutions.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhuma shadow execution persistida para o workspace ativo.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {shadowExecutions.map((item) => (
                    <div key={item.shadowExecutionId} className="rounded-xl border border-white/10 bg-[#0a1527] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.agentId}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{item.shadowExecutionId}</p>
                        </div>
                        <span className="pill">{item.currentStage}</span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval</p>
                          <p className="mt-2 text-sm text-foreground">{item.approvalStatus}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Side effect</p>
                          <p className="mt-2 text-xs text-foreground">{item.sideEffectMode}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Custo estimado</p>
                          <p className="mt-2 text-sm text-foreground">{formatBRL(item.preview.estimatedCostCents)}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Produção</p>
                          <p className="mt-2 break-all text-xs text-foreground">{item.promotion.productionRunId ?? "—"}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-foreground">{item.preview.summary}</p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => void inspectShadowExecution(item.shadowExecutionId)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-foreground transition hover:border-accent/40 hover:text-accent"
                        >
                          {expandedShadowExecutionId === item.shadowExecutionId ? "Ocultar snapshot" : "Ver snapshot completo"}
                        </button>
                      </div>
                      {expandedShadowExecutionId === item.shadowExecutionId ? (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                          {shadowExecutionDetailStatus === "loading" ? (
                            <p className="text-xs text-muted-foreground">Carregando snapshot completo...</p>
                          ) : shadowExecutionDetailStatus === "error" ? (
                            <p className="text-xs text-rose-300">
                              {shadowExecutionDetailError ?? "Falha ao carregar snapshot completo."}
                            </p>
                          ) : shadowExecutionDetail ? (
                            <div className="space-y-3 text-xs text-muted-foreground">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Input ref</p>
                                  <p className="mt-1 break-all text-foreground">{shadowExecutionDetail.inputRef}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Target</p>
                                  <p className="mt-1 text-foreground">{shadowExecutionDetail.promotion.target}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Promoted at</p>
                                  <p className="mt-1 text-foreground">{formatDateTime(shadowExecutionDetail.promotion.promotedAt)}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Warnings</p>
                                {shadowExecutionDetail.preview.warnings.length > 0 ? (
                                  <ul className="mt-2 space-y-1">
                                    {shadowExecutionDetail.preview.warnings.map((warning) => (
                                      <li key={warning}>- {warning}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-foreground">—</p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Next actions</p>
                                {shadowExecutionDetail.preview.nextActions.length > 0 ? (
                                  <ul className="mt-2 space-y-1">
                                    {shadowExecutionDetail.preview.nextActions.map((step) => (
                                      <li key={step}>- {step}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-foreground">—</p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Evidence refs</p>
                                <div className="mt-2 space-y-2">
                                  {shadowExecutionDetail.evidenceRefs.map((evidence) => (
                                    <div key={`${evidence.source}-${evidence.refId}`} className="rounded-md border border-white/10 bg-[#0a1527] p-2">
                                      <p className="text-foreground">{evidence.label}</p>
                                      <p className="mt-1 break-all">{evidence.source} · {evidence.refId}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent">Efficiency Intelligence</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recomendações heurísticas geradas a partir do resumo financeiro do tenant no ciclo atual.
                </p>
                {summary?.optimizationSnapshot?.sourceOfTruth ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fonte oficial: {summary.optimizationSnapshot.sourceOfTruth.cost} /{" "}
                    {summary.optimizationSnapshot.sourceOfTruth.usage} /{" "}
                    {summary.optimizationSnapshot.sourceOfTruth.agents}
                  </p>
                ) : null}
              </div>
              <span className="pill">
                {summary?.optimizationRecommendations?.generatedAt
                  ? `Gerado em ${formatDateTime(summary.optimizationRecommendations.generatedAt)}`
                  : `${topOptimizationRecommendations.length} sugestoes`}
              </span>
            </div>
            {topOptimizationRecommendations.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {topOptimizationRecommendations.map((item: OptimizationRecommendation) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <span className="pill">{formatPercent(item.confidence)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.summary}</p>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>
                        <span className="text-foreground">Economia estimada:</span>{" "}
                        {formatBRL(item.estimatedSavingsCents)}
                      </p>
                      <p>
                        <span className="text-foreground">Custo atual:</span> {formatBRL(item.currentCostCents)}
                      </p>
                      <p>
                        <span className="text-foreground">Custo projetado:</span>{" "}
                        {formatBRL(item.projectedCostCents)}
                      </p>
                      <p>
                        <span className="text-foreground">Aplicação:</span> {item.applyMode.replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
                Nenhuma recomendação heurística disponível no ciclo atual.
              </div>
            )}
            {summary?.optimizationSnapshot?.fleetPolicyCandidates?.length ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Fleet policy candidates</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {summary.optimizationSnapshot.fleetPolicyCandidates.map((item) => (
                    <div key={`fleet-${item.subjectId}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.priority} · {item.recommendationType} · economia {formatBRL(item.estimatedSavingsCents)} · confiança{" "}
                        {formatPercent(item.confidence)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Ação sugerida: {item.suggestedAction.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {effectiveEconomyOpportunitySnapshot ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Economy Opportunity</p>
                    <p className="mt-2 text-sm text-muted-foreground">{effectiveEconomyOpportunitySnapshot.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {effectiveEconomyOpportunitySnapshot.consolidatedSummary}
                    </p>
                    <p className="mt-2 text-xs text-foreground">
                      Recomendação: {effectiveEconomyOpportunitySnapshot.tenantRecommendation}
                    </p>
                    <p className="mt-2 text-xs">
                      <Link to="/app/economy" className="text-accent underline">
                        Abrir diagnóstico econômico
                      </Link>
                    </p>
                  </div>
                  <span className="pill">
                    {effectiveEconomyOpportunitySnapshot.topStatus} · {effectiveEconomyOpportunitySnapshot.topPriority ?? "sem prioridade"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent/80">Cost opportunities</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {effectiveEconomyOpportunitySnapshot.costOpportunities.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent/80">Fleet policy</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {effectiveEconomyOpportunitySnapshot.fleetPolicyOpportunities.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent/80">Economy status</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {effectiveEconomyOpportunitySnapshot.consolidatedClassification}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Audit: {effectiveEconomyOpportunitySnapshot.auditableCostAttention.classification}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Seu plano e cobranca</p>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Plano:</span> {planSummary?.label ?? "Starter B2B"}
            </p>
            <p>
              <span className="text-muted-foreground">Mensalidade base:</span> {formatBRL(planSummary?.basePriceCents ?? 0)}
            </p>
            <p>
              <span className="text-muted-foreground">Inclui:</span> {planSummary?.includedUsers ?? 0} usuarios e{" "}
              {planSummary?.includedRuns ?? 0} runs
            </p>
            <p>
              <span className="text-muted-foreground">Excedente:</span>{" "}
              {formatBRL(planSummary?.overageRunCents ?? 0)}/run e{" "}
              {formatBRL(planSummary?.extraUserCents ?? 0)}/usuario extra
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="glass-subtle space-y-3 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Plano atual</span>
            <p className="text-2xl font-semibold text-foreground">{planSummary?.label ?? "Starter B2B"}</p>
            <p className="text-xs text-muted-foreground">
              Base: {formatBRL(planSummary?.basePriceCents ?? 0)} · Workspaces inclusos:{" "}
              {planSummary?.includedWorkspaces ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              Usuarios: {entitlementSummary?.usersActive ?? 0}/{planSummary?.includedUsers ?? 0}
            </p>
          </div>
          <div className="glass-subtle space-y-3 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Uso mensal</span>
            <p className="text-2xl font-semibold text-foreground">
              {formatBRL(summary?.totals.costCents ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Inclui ledger do ciclo ativo ({summary ? `${formatDateTime(summary.cycleStart)} - ${formatDateTime(summary.cycleEnd)}` : "-"}).
            </p>
          </div>
          <div className="glass-subtle space-y-3 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Previsao 30 dias</span>
            <p className="text-2xl font-semibold text-foreground">{formatBRL(forecastNextCents)}</p>
            <p className="text-xs text-muted-foreground">Baseado na media dos ultimos 7 dias de atividade.</p>
          </div>
          <div className="glass-subtle space-y-3 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Excedente e estimativa</span>
            <p className="text-2xl font-semibold text-foreground">
              {formatBRL(entitlementSummary?.estimatedInvoiceCents ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Base + Runs extras + Usuarios extras = Total previsto
            </p>
            <p className="text-xs text-muted-foreground">
              {`${formatBRL(planSummary?.basePriceCents ?? 0)} + ${formatBRL(
                entitlementSummary?.runOverageCents ?? 0
              )} + ${formatBRL(entitlementSummary?.userOverageCents ?? 0)} = ${formatBRL(
                entitlementSummary?.estimatedInvoiceCents ?? 0
              )}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Runs extra: {entitlementSummary?.runOverage ?? 0} ({formatBRL(entitlementSummary?.runOverageCents ?? 0)})
            </p>
            <p className="text-xs text-muted-foreground">
              Usuarios extras: {entitlementSummary?.usersOverage ?? 0} ({formatBRL(entitlementSummary?.userOverageCents ?? 0)})
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Soft limit</span>
            <span>{summary?.policy?.softLimitPct != null ? `${summary.policy.softLimitPct}%` : "-"}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Hard limit</span>
            <span>{summary?.policy?.hardLimitPct != null ? `${summary.policy.hardLimitPct}%` : "-"}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Consumo atual</span>
            <span>{percent.toFixed(1)}%</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runs no ciclo</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{summary?.totals.runs ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Incluidos: {entitlementSummary?.runsIncludedEffective ?? 0} · Extra: {entitlementSummary?.runOverage ?? 0}
              </p>
            </div>
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Workspace ativo</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{activeWorkspace?.workspaceName ?? "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeWorkspace?.grant
                  ? activeWorkspace.grant.enabled
                    ? "Grant habilitado"
                    : "Grant desabilitado"
                  : "Grant padrão"}
              </p>
            </div>
          </div>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>
      </section>
      </div>

      <section className="glass-panel mt-8">
        <div className="glass-subtle flex flex-col gap-6 p-6 text-sm text-muted-foreground">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Automatize alertas</h3>
            <p className="mt-2 leading-relaxed">
              Configure webhooks e notificacoes para avisar stakeholders quando o consumo ultrapassar 70% do limite suave
              ou quando uma cobranca falhar.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Proximos passos</h4>
            <ul className="space-y-2">
              <li>- Habilite o webhook <code className="rounded bg-black/40 px-1">/webhooks/billing</code></li>
              <li>- Sincronize dashboards no Agent Builder</li>
              <li>- Disponibilize limites customizados por cliente</li>
            </ul>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Soft limit</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {summary?.policy?.softLimitPct != null ? `${summary.policy.softLimitPct}%` : "-"}
              </p>
            </div>
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Hard limit</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {summary?.policy?.hardLimitPct != null ? `${summary.policy.hardLimitPct}%` : "-"}
              </p>
            </div>
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runs/mês</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {summary?.policy?.monthlyRunsLimit ?? "-"}
              </p>
            </div>
            <div className="glass-subtle p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Custo/mês</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {summary?.policy?.monthlyCostCentsLimit != null
                  ? formatBRL(summary.policy.monthlyCostCentsLimit)
                  : "-"}
              </p>
            </div>
          </div>
          <div className="glass-subtle space-y-3 p-4">
            <h4 className="text-sm font-semibold text-foreground">Quotas do tenant</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                placeholder="soft %"
                value={quotaForm.softLimitPct}
                onChange={(event) => setQuotaForm((prev) => ({ ...prev, softLimitPct: event.target.value }))}
              />
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                placeholder="hard %"
                value={quotaForm.hardLimitPct}
                onChange={(event) => setQuotaForm((prev) => ({ ...prev, hardLimitPct: event.target.value }))}
              />
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                placeholder="runs/mês"
                value={quotaForm.monthlyRunsLimit}
                onChange={(event) => setQuotaForm((prev) => ({ ...prev, monthlyRunsLimit: event.target.value }))}
              />
              <input
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
                placeholder="custo/mês (centavos)"
                value={quotaForm.monthlyCostCentsLimit}
                onChange={(event) =>
                  setQuotaForm((prev) => ({ ...prev, monthlyCostCentsLimit: event.target.value }))
                }
              />
            </div>
            <button
              type="button"
              className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent"
              onClick={onSaveQuotas}
              disabled={quotaSaving}
            >
              {quotaSaving ? "Salvando..." : "Salvar quotas"}
            </button>
            {quotaMessage ? <p className="text-xs text-emerald-300">{quotaMessage}</p> : null}
          </div>
        </div>
      </section>

      <section className="glass-panel mt-8 space-y-5 p-8">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Grants por workspace</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Leia habilitação, limites locais e consumo do workspace no mesmo bloco operacional.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
            onClick={() => void loadData()}
          >
            Atualizar
          </button>
        </header>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Workspace em foco</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{selectedWorkspace?.workspaceName ?? "-"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reconciliationWorkspaceId ? "baseado no filtro da reconciliação" : "baseado no workspace ativo"}
            </p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Grants habilitados</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{enabledGrantCount}</p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Agentes habilitados</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{totalEnabledWorkspaceAgents}</p>
            <p className="mt-1 text-xs text-muted-foreground">{workspacesWithEnabledAgents} workspaces com agentes ativos</p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Consumo do workspace em foco</p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {formatBRL(selectedWorkspace?.usage.costCents ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedWorkspace?.usage.runs ?? 0} runs no ciclo
            </p>
          </div>
        </div>
        <div className="glass-subtle grid gap-3 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Grant do workspace em foco</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {selectedWorkspace?.grant?.enabled === false ? "Desabilitado" : "Habilitado"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Limite local de runs</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{selectedWorkspace?.grant?.localRunLimit ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Limite local de custo</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {selectedWorkspace?.grant?.localCostCentsLimit != null
                ? formatBRL(selectedWorkspace.grant.localCostCentsLimit)
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Agentes no workspace em foco</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {selectedWorkspaceAgents.filter((item) => item.enabled).length} habilitados · {selectedWorkspaceAgents.length} total
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {workspaceItems.map((item) => (
            <div key={item.workspaceId} className="glass-subtle space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{item.workspaceName}</p>
                <span className={`pill ${item.grant?.enabled === false ? "bg-rose-500/15 text-rose-200" : ""}`}>
                  {item.grant?.enabled === false ? "Desabilitado" : "Habilitado"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Runs: {item.usage.runs} · Custo: {formatBRL(item.usage.costCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                Limites locais: runs {item.grant?.localRunLimit ?? "-"} · custo{" "}
                {item.grant?.localCostCentsLimit != null ? formatBRL(item.grant.localCostCentsLimit) : "-"}
              </p>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Agentes habilitados</p>
                {(workspaceAgentsByWorkspaceId[item.workspaceId] ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(workspaceAgentsByWorkspaceId[item.workspaceId] ?? []).map((agent) => (
                      <span
                        key={agent.id}
                        className={`pill ${agent.enabled ? "" : "bg-rose-500/15 text-rose-200"}`}
                        title={agent.signatureRef ?? undefined}
                      >
                        {agent.agentKey}
                        {agent.agentVersion ? ` · v${agent.agentVersion}` : ""}
                        {agent.enabled ? "" : " · off"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum agente atribuído a este workspace.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Painel consolidado: {item.usage.runs} runs, {formatBRL(item.usage.costCents)} e{" "}
                  {workspaceAgentCounts[item.workspaceId]?.enabled ?? 0} agentes ativos.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground"
                onClick={() => void onToggleWorkspaceGrant(item)}
                disabled={grantSavingId === item.workspaceId}
              >
                {grantSavingId === item.workspaceId
                  ? "Salvando..."
                  : item.grant?.enabled === false
                  ? "Habilitar"
                  : "Desabilitar"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Grants desabilitados no tenant: {disabledGrantCount}. O bloco cruza grant financeiro, limites locais,
          consumo do ciclo e agentes habilitados por workspace.
        </p>
      </section>

      <section className="glass-panel mt-8 space-y-5 p-8">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Reconciliação</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Conferência entre custo derivado do run, breakdown operacional e ledger financeiro.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={`pill hover:border-accent/40 hover:text-foreground ${
                isInvestigationMode ? "bg-accent/15 text-accent" : ""
              }`}
              onClick={() => {
                if (isInvestigationMode) {
                  const params = new URLSearchParams(searchParams);
                  params.delete("runId");
                  setReconciliationWorkspaceId("");
                  setReconciliationAgent("");
                  setIsInvestigationMode(false);
                  auditInvestigationMode("exited", false, ["manual_exit"]);
                  navigate(`/app/billing${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
                  return;
                }
                setIsInvestigationMode(true);
                auditInvestigationMode("entered", true, ["manual_toggle"]);
              }}
            >
              {isInvestigationMode ? "Sair do modo investigação" : "Entrar no modo investigação"}
            </button>
            {requestedRunId ? (
              <span className="pill">Run filtrado: {requestedRunId}</span>
            ) : null}
            {(periodFromApplied || periodToApplied) ? (
              <span className="pill">
                Período: {periodFromApplied || "-"} → {periodToApplied || "-"}
              </span>
            ) : null}
            {reconciliationAgent ? <span className="pill">Agente: {reconciliationAgent}</span> : null}
            {isInvestigationMode ? <span className="pill bg-accent/15 text-accent">Investigação ativa</span> : null}
            {requestedRunImobHref ? (
              <Link to={requestedRunImobHref} className="pill hover:border-accent/40 hover:text-foreground">
                Abrir caso IMOB
              </Link>
            ) : null}
            <select
              className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              value={reconciliationWorkspaceId}
              onChange={(event) => setReconciliationWorkspaceId(event.target.value)}
            >
              <option value="">Todos os workspaces</option>
              {workspaceItems.map((item) => (
                <option key={item.workspaceId} value={item.workspaceId}>
                  {item.workspaceName}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              value={reconciliationAgent}
              onChange={(event) => setReconciliationAgent(event.target.value)}
            >
              <option value="">Todos os agentes</option>
              {reconciliationAgents.map((item) => (
                <option key={`${item.agent}:${item.agentVersion ?? ""}`} value={item.agent}>
                  {item.agent}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
              onClick={() => void loadData()}
            >
              Atualizar
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
              onClick={onExportReconciliation}
              disabled={!reconciliation}
            >
              Exportar divergências
            </button>
          </div>
        </header>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="glass-subtle space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Audit gaps</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.auditGapCount ?? 0}</p>
          </div>
          <div className="glass-subtle space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Charges duplicados</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.duplicateChargesCount ?? 0}</p>
          </div>
          <div className="glass-subtle space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ledger gaps</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.ledgerGapCount ?? 0}</p>
          </div>
          <div className="glass-subtle space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Runs verificados</p>
            <p className="text-2xl font-semibold text-foreground">{reconciliation?.totals.runsChecked ?? 0}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={`glass-subtle overflow-x-auto p-4 ${isInvestigationMode ? "border border-accent/30" : ""}`}>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Divergências</p>
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">Run</th>
                  <th className="pb-2">Issue</th>
                  <th className="pb-2">Run</th>
                  <th className="pb-2">Breakdown</th>
                  <th className="pb-2">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {(reconciliation?.items.auditGaps ?? []).slice(0, 8).map((item) => (
                  <tr key={`${item.runId}:${item.issue}`} className="border-t border-white/5">
                    <td className="py-2 text-muted-foreground">
                      <Link to={`/app/runs?runId=${encodeURIComponent(item.runId)}`} className="hover:text-foreground">
                        {item.runId}
                      </Link>
                    </td>
                    <td className="py-2 text-foreground">{item.issue}</td>
                    <td className="py-2 text-foreground">{formatBRL(item.runCostCents)}</td>
                    <td className="py-2 text-foreground">{formatBRL(item.breakdownCostCents)}</td>
                    <td className="py-2 text-foreground">{formatBRL(item.ledgerCostCents)}</td>
                  </tr>
                ))}
                {(reconciliation?.items.auditGaps?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={5}>
                      Nenhuma divergência encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className={`glass-subtle overflow-x-auto p-4 ${isInvestigationMode ? "border border-accent/30" : ""}`}>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Gaps e duplicidades</p>
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Referência</th>
                  <th className="pb-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(reconciliation?.items.duplicateCharges ?? []).slice(0, 4).map((item) => (
                  <tr key={`duplicate:${item.runId ?? "null"}:${item.requestId ?? "null"}`} className="border-t border-white/5">
                    <td className="py-2 text-foreground">duplicate_charge</td>
                    <td className="py-2 text-muted-foreground">
                      {item.runId ? (
                        <Link to={`/app/runs?runId=${encodeURIComponent(item.runId)}`} className="hover:text-foreground">
                          {item.runId}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 text-foreground">
                      {item.requestId ?? "-"} · {item.count}x · {formatBRL(item.amountCents)}
                    </td>
                  </tr>
                ))}
                {(reconciliation?.items.ledgerGaps ?? []).slice(0, 4).map((item) => (
                  <tr key={`ledger-gap:${item.ledgerId}:${item.issue}`} className="border-t border-white/5">
                    <td className="py-2 text-foreground">{item.issue}</td>
                    <td className="py-2 text-muted-foreground">
                      {item.runId ? (
                        <Link to={`/app/runs?runId=${encodeURIComponent(item.runId)}`} className="hover:text-foreground">
                          {item.runId}
                        </Link>
                      ) : (
                        item.ledgerId
                      )}
                    </td>
                    <td className="py-2 text-foreground">{item.requestId ?? "-"}</td>
                  </tr>
                ))}
                {(reconciliation?.items.duplicateCharges?.length ?? 0) === 0 &&
                (reconciliation?.items.ledgerGaps?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={3}>
                      Nenhum gap financeiro encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="glass-panel mt-8 space-y-5 p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Ledger + adjustment</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Lançamentos financeiros com vínculo de workspace e navegação direta para o run quando existir.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
            onClick={onExportLedger}
            disabled={ledgerItems.length === 0}
          >
            Exportar financeiro
          </button>
        </header>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Lançamentos</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{ledgerSummary.totalItems}</p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com run</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{ledgerSummary.withRun}</p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sem run</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{ledgerSummary.withoutRun}</p>
          </div>
          <div className="glass-subtle p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total exibido</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{formatBRL(ledgerSummary.totalAmountCents)}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[0.35fr,0.65fr]">
          <div className="glass-subtle space-y-3 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Novo adjustment</p>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
              placeholder="Valor em centavos (ex: 1500 ou -1500)"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
              value={adjustmentWorkspaceId}
              onChange={(event) => setAdjustmentWorkspaceId(event.target.value)}
            >
              {workspaceItems.map((item) => (
                <option key={item.workspaceId} value={item.workspaceId}>
                  {item.workspaceName}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-foreground"
              placeholder="Descrição (opcional)"
              value={adjustmentDescription}
              onChange={(event) => setAdjustmentDescription(event.target.value)}
            />
            <button
              type="button"
              className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent"
              onClick={onCreateAdjustment}
              disabled={adjustmentSaving}
            >
              {adjustmentSaving ? "Gravando..." : "Criar adjustment"}
            </button>
            {adjustmentMessage ? <p className="text-xs text-emerald-300">{adjustmentMessage}</p> : null}
          </div>
          <div className={`glass-subtle overflow-x-auto p-4 ${isInvestigationMode ? "border border-accent/30" : ""}`}>
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">Data</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Workspace</th>
                  <th className="pb-2">Valor</th>
                  <th className="pb-2">Run</th>
                  <th className="pb-2">Vínculo</th>
                </tr>
              </thead>
              <tbody>
                {ledgerItems.map((item) => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="py-2 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                    <td className="py-2 text-foreground">{item.entryType}</td>
                    <td className="py-2 text-foreground">{item.workspaceName ?? "-"}</td>
                    <td className="py-2 text-foreground">{formatBRL(item.amountCents)}</td>
                    <td className="py-2 text-muted-foreground">
                      {item.runId ? (
                        <Link to={`/app/runs?runId=${encodeURIComponent(item.runId)}`} className="hover:text-foreground">
                          {item.runId}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      <div className="space-y-1">
                        <p>
                          requestId: {item.requestId ?? "-"}
                        </p>
                        <p>
                          provider/model: {item.provider ?? "-"} / {item.model ?? "-"}
                        </p>
                        {item.runId ? (
                          <p>
                            <Link
                              to={`/app/billing?runId=${encodeURIComponent(item.runId)}`}
                              className="hover:text-foreground"
                            >
                              Abrir reconciliação do run
                            </Link>
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {ledgerItems.length === 0 ? (
                  <tr>
                    <td className="py-2 text-muted-foreground" colSpan={6}>
                      Nenhum lançamento financeiro encontrado para os filtros atuais.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <BillingGuideFooter />
    </>
  );
};

export default BillingPage;
