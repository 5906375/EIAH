import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "@/state/sessionStore";
import {
  apiCreateTenantBillingAdjustment,
  apiGetTenantBillingLedger,
  apiGetTenantBillingSummary,
  apiGetTenantBillingWorkspaces,
  apiPatchTenantQuotas,
  apiPatchTenantWorkspaceGrant,
  type TenantBillingLedgerItem,
  type TenantBillingSummary,
  type TenantBillingWorkspaceItem,
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

type Mode = "user" | "dev";
type Theme = "dark" | "light";

const randomClient = () => `cliente-${Math.floor(Math.random() * 1000)}`;
const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "workspace-demo";

const createDefaultPayload = (workspaceId: string) =>
  `{
  "type": "billing.soft_threshold.crossed",
  "workspaceId": "${workspaceId}"
}`;

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
  const { workspaceId } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TenantBillingSummary | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<TenantBillingWorkspaceItem[]>([]);
  const [ledgerItems, setLedgerItems] = useState<TenantBillingLedgerItem[]>([]);

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
      const [summaryRes, workspacesRes, ledgerRes] = await Promise.all([
        apiGetTenantBillingSummary(),
        apiGetTenantBillingWorkspaces(),
        apiGetTenantBillingLedger({ limit: 12 }),
      ]);
      setSummary(summaryRes.data);
      setWorkspaceItems(workspacesRes.data.items || []);
      setLedgerItems(ledgerRes.data.items || []);

      const policy = summaryRes.data.policy;
      setQuotaForm({
        softLimitPct: policy?.softLimitPct != null ? String(policy.softLimitPct) : "",
        hardLimitPct: policy?.hardLimitPct != null ? String(policy.hardLimitPct) : "",
        monthlyRunsLimit: policy?.monthlyRunsLimit != null ? String(policy.monthlyRunsLimit) : "",
        monthlyCostCentsLimit:
          policy?.monthlyCostCentsLimit != null ? String(policy.monthlyCostCentsLimit) : "",
      });

      const activeWorkspace = workspacesRes.data.items.find((item) => item.isActiveWorkspace);
      setAdjustmentWorkspaceId(activeWorkspace?.workspaceId ?? workspacesRes.data.items[0]?.workspaceId ?? "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar billing do tenant.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [workspaceId]);

  const percent = useMemo(() => {
    if (!summary?.policy?.monthlyCostCentsLimit || summary.policy.monthlyCostCentsLimit <= 0) return 0;
    return Math.min(100, (summary.totals.costCents / summary.policy.monthlyCostCentsLimit) * 100);
  }, [summary]);

  const forecastNextCents = useMemo(() => {
    const current = summary?.totals.costCents ?? 0;
    return Math.round(current * 1.3);
  }, [summary]);

  const activeWorkspace = workspaceItems.find((item) => item.isActiveWorkspace);

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

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[0.6fr,0.4fr]">
      <section className="glass-panel p-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Billing & quotas</p>
            <h2 className="text-3xl font-display font-semibold text-foreground">Controle financeiro</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Mantenha limites saudaveis por projeto e aprove licencas antes da operacao atingir o hard limit.
            </p>
          </div>
          <span className="pill">
            {loading ? "Carregando..." : `Tenant: ${summary?.tenantId ?? "-"}`}
          </span>
        </header>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
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

      <aside className="glass-panel flex flex-col gap-6 p-8 text-sm text-muted-foreground">
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
      </aside>
      </div>

      <section className="glass-panel mt-8 space-y-5 p-8">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Grants por workspace</h3>
          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground"
            onClick={() => void loadData()}
          >
            Atualizar
          </button>
        </header>
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
      </section>

      <section className="glass-panel mt-8 space-y-5 p-8">
        <header>
          <h3 className="text-lg font-semibold text-foreground">Ledger + adjustment</h3>
        </header>
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
          <div className="glass-subtle overflow-x-auto p-4">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">Data</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Workspace</th>
                  <th className="pb-2">Valor</th>
                  <th className="pb-2">Run</th>
                </tr>
              </thead>
              <tbody>
                {ledgerItems.map((item) => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="py-2 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                    <td className="py-2 text-foreground">{item.entryType}</td>
                    <td className="py-2 text-foreground">{item.workspaceName ?? "-"}</td>
                    <td className="py-2 text-foreground">{formatBRL(item.amountCents)}</td>
                    <td className="py-2 text-muted-foreground">{item.runId ?? "-"}</td>
                  </tr>
                ))}
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
