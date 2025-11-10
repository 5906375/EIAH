import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/state/sessionStore";
const quota = {
    softLimitCents: 500_000,
    hardLimitCents: 800_000,
    monthUsageCents: 210_450,
    forecastNextCents: 320_000,
};
const formatBRL = (cents) => (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
});
const randomClient = () => `cliente-${Math.floor(Math.random() * 1000)}`;
const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "workspace-demo";
const createDefaultPayload = (workspaceId) => `{
  "type": "billing.soft_threshold.crossed",
  "workspaceId": "${workspaceId}"
}`;
const BillingGuideFooter = () => {
    const [theme, setTheme] = useState("dark");
    const [mode, setMode] = useState("user");
    const [collapsed, setCollapsed] = useState(false);
    const [usoMensal, setUsoMensal] = useState("2104.50");
    const [softLimit, setSoftLimit] = useState("5000");
    const [hardLimit, setHardLimit] = useState("8000");
    const [consumoOut, setConsumoOut] = useState("");
    const [media7, setMedia7] = useState("107");
    const [forecastOut, setForecastOut] = useState("");
    const [softAlert, setSoftAlert] = useState("5000");
    const [usoAlert, setUsoAlert] = useState("2104.50");
    const [estadoAlert, setEstadoAlert] = useState("normal");
    const [hysteresisOut, setHysteresisOut] = useState("");
    const [secret, setSecret] = useState("test");
    const { workspaceId = DEFAULT_WORKSPACE_ID } = useSession();
    const [payloadTouched, setPayloadTouched] = useState(false);
    const [payload, setPayload] = useState(() => createDefaultPayload(workspaceId));
    const [timestamp, setTimestamp] = useState("");
    const [eventId, setEventId] = useState("");
    const [signature, setSignature] = useState("");
    const [curlSnippet, setCurlSnippet] = useState("");
    const [projectSoft, setProjectSoft] = useState("600000");
    const [projectHard, setProjectHard] = useState("900000");
    const [rows, setRows] = useState([
        { id: "row-acme", name: "acme-corp", soft: "150000", hard: "250000" },
        { id: "row-contoso", name: "contoso", soft: "100000", hard: "200000" },
    ]);
    const [jsonOut, setJsonOut] = useState("");
    const formatBRL = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), []);
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
        if (estadoAtual === "normal" && uso >= liga)
            novoEstado = "alerta";
        if (estadoAtual === "alerta" && uso < desliga)
            novoEstado = "normal";
        setHysteresisOut(`Estado: ${estadoAtual} → ${novoEstado} · uso=${formatBRL.format(uso)} · on≥${formatBRL.format(liga)} · off<${formatBRL.format(desliga)}`);
    };
    const uuidv4 = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
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
        const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret || "test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const mac = await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${ts}.${body}`));
        const hex = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        setTimestamp(ts);
        setEventId(eid);
        setSignature(`sha256=${hex}`);
        setCurlSnippet([
            `curl -i -X POST https://seu-dominio.com/webhooks/billing`,
            `  -H "Content-Type: application/json"`,
            `  -H "X-Timestamp: ${ts}"`,
            `  -H "X-Event-Id: ${eid}"`,
            `  -H "X-Signature: sha256=${hex}"`,
            `  --data '${body.replace(/\n/g, " ")}'`,
        ].join(" \\\n"));
    };
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        }
        catch {
            alert("Copie manualmente.");
        }
    };
    const addClientRow = () => {
        setRows((prev) => [...prev, { id: randomClient(), name: randomClient(), soft: "100000", hard: "200000" }]);
    };
    const updateRow = (id, field, value) => {
        setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };
    const removeRow = (id) => {
        setRows((prev) => prev.filter((row) => row.id !== id));
    };
    const buildPatchJson = () => {
        const perClient = Object.fromEntries(rows.map((row) => [
            row.name || randomClient(),
            { soft: Number(row.soft) || 0, hard: Number(row.hard) || 0 },
        ]));
        const json = JSON.stringify({
            softLimitCents: Number(projectSoft) || 0,
            hardLimitCents: Number(projectHard) || 0,
            perClient,
        }, null, 2);
        setJsonOut(json);
        return json;
    };
    const guideClass = useMemo(() => [
        "bq-wrap",
        theme === "light" ? "bq-theme-light" : "bq-theme-dark",
        mode === "dev" ? "bq-mode-dev" : "bq-mode-user",
    ].join(" "), [theme, mode]);
    return (_jsxs("section", { id: "billing-guide-footer", className: guideClass, "aria-label": "Guia Interativo de Billing & Quotas", children: [_jsx("style", { children: `
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
      ` }), _jsxs("div", { className: "bq-head", children: [_jsx("h2", { children: "Guia Interativo \u00B7 Billing & Quotas" }), _jsxs("div", { className: "bq-actions", children: [_jsxs("select", { id: "bq-mode", className: "bq-select", title: "Modo", value: mode, onChange: (event) => setMode(event.target.value), children: [_jsx("option", { value: "user", children: "Usu\u00E1rio final" }), _jsx("option", { value: "dev", children: "Desenvolvimento" })] }), _jsx("button", { id: "bq-theme", className: "bq-btn", title: "Alternar tema", type: "button", onClick: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")), children: "\uD83C\uDF13" }), _jsx("button", { id: "bq-collapse", className: "bq-btn", title: "Recolher/Expandir", type: "button", onClick: () => setCollapsed((prev) => !prev), children: collapsed ? "▸" : "▾" })] })] }), _jsxs("div", { id: "bq-body", className: "bq-grid", style: { display: collapsed ? "none" : undefined }, children: [_jsxs("article", { className: "bq-card", children: [_jsx("header", { children: _jsx("h3", { children: "Vis\u00E3o r\u00E1pida" }) }), _jsxs("div", { className: "bq-kv", children: [_jsxs("div", { children: [_jsx("span", { children: "Uso mensal" }), _jsx("input", { value: usoMensal, onChange: (event) => setUsoMensal(event.target.value), type: "number", step: "0.01" })] }), _jsxs("div", { children: [_jsx("span", { children: "Soft limit" }), _jsx("input", { value: softLimit, onChange: (event) => setSoftLimit(event.target.value), type: "number", step: "0.01" })] }), _jsxs("div", { children: [_jsx("span", { children: "Hard limit" }), _jsx("input", { value: hardLimit, onChange: (event) => setHardLimit(event.target.value), type: "number", step: "0.01" })] })] }), _jsxs("div", { className: "bq-row", children: [_jsx("button", { className: "bq-btn", type: "button", onClick: computeConsumption, children: "Calcular consumo" }), _jsx("output", { className: "bq-out", children: consumoOut })] }), _jsx("p", { className: "bq-note", children: "Regra: consumo atual = uso_mensal / hard_limit. Estimativas pendentes s\u00E3o substitu\u00EDdas por confirmadas (sem dupla contagem)." })] }), _jsxs("article", { className: "bq-card", children: [_jsx("header", { children: _jsx("h3", { children: "Previs\u00E3o (30 dias)" }) }), _jsx("div", { className: "bq-kv", children: _jsxs("div", { children: [_jsx("span", { children: "M\u00E9dia di\u00E1ria (\u00FAltimos 7d)" }), _jsx("input", { value: media7, onChange: (event) => setMedia7(event.target.value), type: "number", step: "0.01" })] }) }), _jsxs("div", { className: "bq-row", children: [_jsx("button", { className: "bq-btn", type: "button", onClick: computeForecast, children: "Projetar" }), _jsx("output", { className: "bq-out", children: forecastOut })] }), _jsxs("p", { className: "bq-note", children: ["Sugest\u00E3o: usar m\u00E9dia m\u00F3vel 7d com ", _jsx("em", { children: "winsorization" }), " e histerese de alertas 70%/68% do soft."] })] }), _jsxs("article", { className: "bq-card", children: [_jsx("header", { children: _jsx("h3", { children: "Alertas & Histerese 70% / 68%" }) }), _jsxs("div", { className: "bq-kv", children: [_jsxs("div", { children: [_jsx("span", { children: "Soft limit" }), _jsx("input", { value: softAlert, onChange: (event) => setSoftAlert(event.target.value), type: "number", step: "0.01" })] }), _jsxs("div", { children: [_jsx("span", { children: "Uso mensal" }), _jsx("input", { value: usoAlert, onChange: (event) => setUsoAlert(event.target.value), type: "number", step: "0.01" })] }), _jsxs("div", { children: [_jsx("span", { children: "Estado atual" }), _jsxs("select", { value: estadoAlert, onChange: (event) => setEstadoAlert(event.target.value), children: [_jsx("option", { value: "normal", children: "normal" }), _jsx("option", { value: "alerta", children: "alerta" })] })] })] }), _jsxs("div", { className: "bq-row", children: [_jsx("button", { className: "bq-btn", type: "button", onClick: computeHysteresis, children: "Checar estado" }), _jsx("output", { className: "bq-out", children: hysteresisOut })] }), _jsxs("details", { className: "bq-details", children: [_jsx("summary", { children: "Como funciona" }), _jsxs("ul", { children: [_jsx("li", { children: "Dispara alerta quando uso \u2265 70% do soft." }), _jsx("li", { children: "S\u00F3 volta a normal quando uso < 68% do soft." })] })] })] }), _jsxs("article", { className: "bq-card", "data-mode": "dev", children: [_jsx("header", { children: _jsx("h3", { children: "Webhook tester (HMAC)" }) }), _jsx("label", { className: "bq-label", children: "Segredo (teste local \u2014 n\u00E3o use o real em produ\u00E7\u00E3o)" }), _jsx("input", { value: secret, onChange: (event) => setSecret(event.target.value), type: "password", placeholder: "ex.: test" }), _jsx("label", { className: "bq-label", children: "Payload (JSON)" }), _jsx("textarea", { value: payload, onChange: (event) => {
                                    setPayloadTouched(true);
                                    setPayload(event.target.value);
                                }, rows: 6 }), _jsxs("div", { className: "bq-kv", children: [_jsxs("div", { children: [_jsx("span", { children: "X-Timestamp" }), _jsx("input", { value: timestamp, readOnly: true, placeholder: "auto" })] }), _jsxs("div", { children: [_jsx("span", { children: "X-Event-Id" }), _jsx("input", { value: eventId, readOnly: true, placeholder: "auto" })] }), _jsxs("div", { children: [_jsx("span", { children: "X-Signature" }), _jsx("input", { value: signature, readOnly: true, placeholder: "sha256=..." })] })] }), _jsxs("div", { className: "bq-row", children: [_jsx("button", { className: "bq-btn", type: "button", onClick: generateHeaders, children: "Gerar headers" }), _jsx("button", { className: "bq-btn", type: "button", onClick: () => curlSnippet && copyToClipboard(curlSnippet), children: "Copiar cURL" })] }), _jsxs("p", { className: "bq-note", children: ["Assinatura: ", _jsx("code", { children: "sha256(secret, ts + \".\" + rawBody)" }), ". Verifique HMAC, timestamp \u2264 5 min e dedupe por", " ", _jsx("code", { children: "X-Event-Id" }), "."] }), _jsx("pre", { className: "bq-pre", "aria-live": "polite", children: curlSnippet })] }), _jsxs("article", { className: "bq-card", "data-mode": "user", children: [_jsx("header", { children: _jsx("h3", { children: "Quotas \u2014 Guia do Usu\u00E1rio" }) }), _jsxs("p", { children: ["Os limites de consumo do projeto s\u00E3o definidos pelo time administrador. Ao atingir o ", _jsx("strong", { children: "soft limit" }), ", algumas fun\u00E7\u00F5es podem ser limitadas. No ", _jsx("strong", { children: "hard limit" }), ", novas execu\u00E7\u00F5es s\u00E3o bloqueadas."] }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("strong", { children: "O que voc\u00EA pode fazer:" }), " revise o consumo, use ", _jsx("em", { children: "Simular primeiro" }), " e solicite aumento de cota se necess\u00E1rio."] }), _jsxs("li", { children: [_jsx("strong", { children: "Transpar\u00EAncia:" }), " acompanhe consumo, previs\u00E3o 30 dias e status de alertas no painel."] }), _jsxs("li", { children: [_jsx("strong", { children: "Suporte:" }), " utilize \u201CSolicitar aumento\u201D para abrir um ticket quando estiver bloqueado."] })] })] }), _jsxs("article", { className: "bq-card", "data-mode": "dev", children: [_jsx("header", { children: _jsx("h3", { children: "Quotas customizadas" }) }), _jsxs("div", { className: "bq-kv", children: [_jsxs("div", { children: [_jsx("span", { children: "Projeto (soft)" }), _jsx("input", { value: projectSoft, onChange: (event) => setProjectSoft(event.target.value), type: "number" })] }), _jsxs("div", { children: [_jsx("span", { children: "Projeto (hard)" }), _jsx("input", { value: projectHard, onChange: (event) => setProjectHard(event.target.value), type: "number" })] })] }), _jsxs("table", { className: "bq-table", "aria-label": "Limites por cliente", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Soft" }), _jsx("th", { children: "Hard" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { value: row.name, onChange: (event) => updateRow(row.id, "name", event.target.value) }) }), _jsx("td", { children: _jsx("input", { value: row.soft, type: "number", onChange: (event) => updateRow(row.id, "soft", event.target.value) }) }), _jsx("td", { children: _jsx("input", { value: row.hard, type: "number", onChange: (event) => updateRow(row.id, "hard", event.target.value) }) }), _jsx("td", { children: _jsx("button", { className: "bq-icon", type: "button", "aria-label": "remover", onClick: () => removeRow(row.id), children: "\u2716" }) })] }, row.id))) })] }), _jsxs("div", { className: "bq-row", children: [_jsx("button", { className: "bq-btn", type: "button", onClick: addClientRow, children: "Adicionar cliente" }), _jsx("button", { className: "bq-btn", type: "button", onClick: buildPatchJson, children: "Gerar PATCH" }), _jsx("button", { className: "bq-btn", type: "button", onClick: () => copyToClipboard(jsonOut || buildPatchJson()), children: "Copiar JSON" })] }), _jsx("pre", { className: "bq-pre", "aria-live": "polite", children: jsonOut })] })] })] }));
};
const BillingPage = () => {
    const percent = Math.min(100, (quota.monthUsageCents / quota.hardLimitCents) * 100);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid gap-8 lg:grid-cols-[0.6fr,0.4fr]", children: [_jsxs("section", { className: "glass-panel p-8", children: [_jsxs("header", { className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.35em] text-accent", children: "Billing & quotas" }), _jsx("h2", { className: "text-3xl font-display font-semibold text-foreground", children: "Controle financeiro" }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Mantenha limites saudaveis por projeto e aprove licencas antes da operacao atingir o hard limit." })] }), _jsx("span", { className: "pill", children: "Atualizado ha 3 min" })] }), _jsxs("div", { className: "mt-8 grid gap-6 md:grid-cols-2", children: [_jsxs("div", { className: "glass-subtle space-y-3 p-5", children: [_jsx("span", { className: "text-xs uppercase tracking-[0.2em] text-muted-foreground", children: "Uso mensal" }), _jsx("p", { className: "text-2xl font-semibold text-foreground", children: formatBRL(quota.monthUsageCents) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Inclui custos de runs confirmados e estimativas pendentes." })] }), _jsxs("div", { className: "glass-subtle space-y-3 p-5", children: [_jsx("span", { className: "text-xs uppercase tracking-[0.2em] text-muted-foreground", children: "Previsao 30 dias" }), _jsx("p", { className: "text-2xl font-semibold text-foreground", children: formatBRL(quota.forecastNextCents) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Baseado na media dos ultimos 7 dias de atividade." })] })] }), _jsxs("div", { className: "mt-8 space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between text-sm text-muted-foreground", children: [_jsx("span", { children: "Soft limit" }), _jsx("span", { children: formatBRL(quota.softLimitCents) })] }), _jsxs("div", { className: "flex items-center justify-between text-sm text-muted-foreground", children: [_jsx("span", { children: "Hard limit" }), _jsx("span", { children: formatBRL(quota.hardLimitCents) })] }), _jsx("div", { className: "relative h-3 w-full overflow-hidden rounded-full bg-white/10", children: _jsx("div", { className: "absolute inset-y-0 left-0 rounded-full bg-accent", style: { width: `${percent}%` } }) }), _jsxs("div", { className: "flex items-center justify-between text-xs text-muted-foreground", children: [_jsx("span", { children: "Consumo atual" }), _jsxs("span", { children: [percent.toFixed(1), "%"] })] })] })] }), _jsxs("aside", { className: "glass-panel flex flex-col gap-6 p-8 text-sm text-muted-foreground", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-foreground", children: "Automatize alertas" }), _jsx("p", { className: "mt-2 leading-relaxed", children: "Configure webhooks e notificacoes para avisar stakeholders quando o consumo ultrapassar 70% do limite suave ou quando uma cobranca falhar." })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h4", { className: "text-sm font-semibold text-foreground", children: "Proximos passos" }), _jsxs("ul", { className: "space-y-2", children: [_jsxs("li", { children: ["- Habilite o webhook ", _jsx("code", { className: "rounded bg-black/40 px-1", children: "/webhooks/billing" })] }), _jsx("li", { children: "- Sincronize dashboards no Agent Builder" }), _jsx("li", { children: "- Disponibilize limites customizados por cliente" })] })] }), _jsxs("p", { children: ["Precisa renegociar o limite? Abra um ticket no orquestrador ou registre um ", _jsx("em", { children: "PlanQuota override" }), " direto pela API."] })] })] }), _jsx(BillingGuideFooter, {})] }));
};
export default BillingPage;
