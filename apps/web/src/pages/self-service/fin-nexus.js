import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import { apiCreatePlan, apiSimulatePlan, ApiError, } from "@/lib/api";
const finNexusInitialValues = {
    question: "",
    portfolio: "",
    horizon: "",
    riskTolerance: "",
    newsFocus: "",
    notes: "",
};
const finNexusFields = [
    {
        key: "question",
        label: "Decisão ou análise financeira central",
        placeholder: "Ex.: Devemos ajustar o plano de cobrança ou revisar descontos ativos?",
        rows: 3,
    },
    {
        key: "portfolio",
        label: "Carteira ou estrutura financeira atual",
        placeholder: "Ex.: Planos ativos: 120; inadimplência 3%; saldo em caixa R$ 180.000,00",
        rows: 3,
    },
    {
        key: "horizon",
        label: "Horizonte e meta operacional",
        placeholder: "Ex.: Curto prazo (30d) reduzir churn; médio (6m) aumentar MRR em 15%",
        rows: 2,
    },
    {
        key: "riskTolerance",
        label: "Parâmetros e tolerância a risco",
        placeholder: "Ex.: Tolerância baixa a atrasos; política de reembolso 7 dias; SLA crítico 99,9%",
        rows: 2,
    },
    {
        key: "newsFocus",
        label: "Fatores externos ou eventos relevantes",
        placeholder: "Ex.: Alterações fiscais, novos gateways, variação cambial, auditorias",
        rows: 2,
    },
    {
        key: "notes",
        label: "Observações e instruções adicionais",
        placeholder: "Ex.: Preferência por faturamento white-label, necessidade de integração ERP, restrições contratuais",
        rows: 2,
    },
];
const defaultPlanBuilderState = {
    planId: "plan_demo_001",
    name: "FinNexus Starter",
    amount: "9900",
    currency: "BRL",
    interval: "monthly",
    brandName: "Sua Marca",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#0ea5e9",
    emailFrom: "financeiro@exemplo.com",
    rulesText: "require_liquidity_proof",
    idempotencyKey: "",
    metadataCashPosition: "",
    metadataLiquidityProof: "",
    customInvoiceTitle: "",
    customPaymentSuccess: "",
};
function normalizeRules(rulesText) {
    const tokens = rulesText
        .split(/\r?\n|,/)
        .map((token) => token.trim())
        .filter(Boolean);
    return tokens.length > 0 ? tokens : undefined;
}
function normalizeMetadata(state) {
    const metadata = {};
    if (state.metadataCashPosition.trim().length > 0) {
        const cleaned = state.metadataCashPosition.trim().replace(",", ".");
        const numericValue = Number(cleaned);
        metadata.cash_position = Number.isFinite(numericValue) ? numericValue : state.metadataCashPosition.trim();
    }
    if (state.metadataLiquidityProof.trim().length > 0) {
        metadata.liquidity_proof = state.metadataLiquidityProof.trim();
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
}
function normalizeCustomTexts(state) {
    const customTexts = {};
    if (state.customInvoiceTitle.trim().length > 0) {
        customTexts.invoice_title = state.customInvoiceTitle.trim();
    }
    if (state.customPaymentSuccess.trim().length > 0) {
        customTexts.payment_success = state.customPaymentSuccess.trim();
    }
    return Object.keys(customTexts).length > 0 ? customTexts : undefined;
}
function buildPlanSpecFromState(state) {
    const amountCents = Number(state.amount);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
        return {
            ok: false,
            error: "Informe um valor em centavos maior que zero (somente números inteiros).",
        };
    }
    const planId = state.planId.trim();
    const planName = state.name.trim();
    const brandName = state.brandName.trim();
    const logoUrl = state.logoUrl.trim();
    const primaryColor = state.primaryColor.trim();
    const emailFrom = state.emailFrom.trim();
    if (!planId || !planName) {
        return {
            ok: false,
            error: "plan_id e name são obrigatórios.",
        };
    }
    if (!brandName || !logoUrl || !primaryColor || !emailFrom) {
        return {
            ok: false,
            error: "Preencha todos os campos de branding (marca, logo, cor e e-mail).",
        };
    }
    const spec = {
        plan_id: planId,
        name: planName,
        amount: amountCents,
        currency: state.currency,
        interval: state.interval,
        branding: {
            brand_name: brandName,
            logo_url: logoUrl,
            primary_color: primaryColor,
            email_from: emailFrom,
        },
    };
    const normalizedRules = normalizeRules(state.rulesText);
    if (normalizedRules) {
        spec.rules = normalizedRules;
    }
    const metadata = normalizeMetadata(state);
    if (metadata) {
        spec.metadata = metadata;
    }
    const customTexts = normalizeCustomTexts(state);
    if (customTexts) {
        spec.custom_texts = customTexts;
    }
    return { ok: true, spec };
}
function PlanBuilder() {
    const [state, setState] = useState(defaultPlanBuilderState);
    const [formError, setFormError] = useState(null);
    const [simulateState, setSimulateState] = useState({ status: "idle" });
    const [createState, setCreateState] = useState({ status: "idle" });
    const handleInputChange = useCallback((key, value) => {
        setState((prev) => ({ ...prev, [key]: value }));
    }, []);
    const handleSimulate = useCallback(async () => {
        const result = buildPlanSpecFromState(state);
        if (!result.ok) {
            setFormError(result.error);
            return;
        }
        setFormError(null);
        setSimulateState({ status: "loading" });
        try {
            const response = await apiSimulatePlan(result.spec);
            setSimulateState({
                status: "success",
                spec: response.data.spec,
                needMoreInfo: response.data.needMoreInfo ?? null,
            });
        }
        catch (error) {
            if (error instanceof ApiError) {
                setSimulateState({
                    status: "error",
                    message: error.message,
                    details: error.body,
                });
            }
            else {
                setSimulateState({
                    status: "error",
                    message: error instanceof Error ? error.message : "Falha ao simular plano.",
                });
            }
        }
    }, [state]);
    const handleCreatePlan = useCallback(async () => {
        const result = buildPlanSpecFromState(state);
        if (!result.ok) {
            setFormError(result.error);
            return;
        }
        setFormError(null);
        setCreateState({ status: "loading" });
        try {
            const response = await apiCreatePlan(result.spec, {
                idempotencyKey: state.idempotencyKey.trim() || undefined,
            });
            setCreateState({
                status: "success",
                planId: response.data.planId,
                jobId: response.data.jobId ?? null,
                idempotencyKey: response.data.idempotencyKey,
                needsAdditionalInfo: Boolean(response.data.needsAdditionalInfo),
            });
        }
        catch (error) {
            if (error instanceof ApiError) {
                setCreateState({
                    status: "error",
                    message: error.message,
                    details: error.body,
                });
            }
            else {
                setCreateState({
                    status: "error",
                    message: error instanceof Error ? error.message : "Falha ao enfileirar criação do plano.",
                });
            }
        }
    }, [state]);
    return (_jsxs("section", { className: "space-y-6 rounded-3xl border border-white/10 bg-surface/70 p-6", children: [_jsxs("header", { className: "space-y-2", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-muted-foreground", children: "Gateway FinNexus" }), _jsx("h2", { className: "text-2xl font-display font-semibold text-foreground", children: "Builder de planos" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Valide a especifica\u00E7\u00E3o de um plano white-label antes de envi\u00E1-la para cria\u00E7\u00E3o. Use o modo de simula\u00E7\u00E3o para checar consist\u00EAncia e pr\u00E9-requisitos; quando estiver tudo certo, envie para o worker FinNexus e acompanhe pelo painel de runs." })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["ID do plano", _jsx("input", { value: state.planId, onChange: (event) => handleInputChange("planId", event.target.value), placeholder: "plan_enterprise_2025", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Nome", _jsx("input", { value: state.name, onChange: (event) => handleInputChange("name", event.target.value), placeholder: "FinNexus Enterprise", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Valor em centavos", _jsx("input", { type: "number", min: 1, step: 1, value: state.amount, onChange: (event) => handleInputChange("amount", event.target.value), placeholder: "9900", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Moeda", _jsxs("select", { value: state.currency, onChange: (event) => handleInputChange("currency", event.target.value), className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none", children: [_jsx("option", { value: "BRL", children: "BRL" }), _jsx("option", { value: "USD", children: "USD" })] })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Intervalo", _jsxs("select", { value: state.interval, onChange: (event) => handleInputChange("interval", event.target.value), className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none", children: [_jsx("option", { value: "monthly", children: "Mensal" }), _jsx("option", { value: "yearly", children: "Anual" })] })] })] })] }), _jsxs("div", { className: "space-y-4 rounded-3xl border border-white/5 bg-black/40 p-4", children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground", children: "Branding" }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Marca", _jsx("input", { value: state.brandName, onChange: (event) => handleInputChange("brandName", event.target.value), placeholder: "FinNexus Labs", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Logo URL", _jsx("input", { value: state.logoUrl, onChange: (event) => handleInputChange("logoUrl", event.target.value), placeholder: "https://example.com/logo.png", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Cor prim\u00E1ria", _jsx("input", { value: state.primaryColor, onChange: (event) => handleInputChange("primaryColor", event.target.value), placeholder: "#0ea5e9", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["E-mail de origem", _jsx("input", { value: state.emailFrom, onChange: (event) => handleInputChange("emailFrom", event.target.value), placeholder: "financeiro@exemplo.com", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] })] })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "md:col-span-2 flex flex-col gap-2 text-sm text-foreground", children: ["Regras (uma por linha ou separadas por v\u00EDrgula)", _jsx("textarea", { value: state.rulesText, onChange: (event) => handleInputChange("rulesText", event.target.value), rows: 3, placeholder: "Exemplos:\nrequire_liquidity_proof\npix_available", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Cash position (metadata)", _jsx("input", { value: state.metadataCashPosition, onChange: (event) => handleInputChange("metadataCashPosition", event.target.value), placeholder: "Ex.: 0 (sem caixa dispon\u00EDvel)", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Prova de liquidez (metadata)", _jsx("input", { value: state.metadataLiquidityProof, onChange: (event) => handleInputChange("metadataLiquidityProof", event.target.value), placeholder: "URL segura ou ID do documento", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Custom text: t\u00EDtulo da fatura", _jsx("input", { value: state.customInvoiceTitle, onChange: (event) => handleInputChange("customInvoiceTitle", event.target.value), placeholder: "Ex.: Fatura FinNexus 2025", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Custom text: confirma\u00E7\u00E3o de pagamento", _jsx("input", { value: state.customPaymentSuccess, onChange: (event) => handleInputChange("customPaymentSuccess", event.target.value), placeholder: "Ex.: Obrigado! Seu pagamento foi conciliado.", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Idempotency key (opcional)", _jsx("input", { value: state.idempotencyKey, onChange: (event) => handleInputChange("idempotencyKey", event.target.value), placeholder: "Somente se desejar controlar manualmente", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] })] }), formError ? (_jsx("p", { className: "rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200", children: formError })) : null, _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("button", { type: "button", onClick: handleSimulate, className: "rounded-full border border-accent/60 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60", disabled: simulateState.status === "loading", children: simulateState.status === "loading" ? "Simulando..." : "Simular" }), _jsx("button", { type: "button", onClick: handleCreatePlan, className: "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60", disabled: createState.status === "loading", children: createState.status === "loading" ? "Enfileirando..." : "Criar plano" })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2 rounded-3xl border border-white/10 bg-black/40 p-4", children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground", children: "Resultado da simula\u00E7\u00E3o" }), simulateState.status === "idle" ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "Preencha os dados acima e clique em simular para validar a spec." })) : null, simulateState.status === "loading" ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "Validando payload com schema FinNexus\u2026" })) : null, simulateState.status === "error" ? (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-rose-200", children: simulateState.message }), simulateState.details ? (_jsx("pre", { className: "max-h-48 overflow-auto rounded-xl bg-black/60 p-3 text-[11px] text-muted-foreground", children: JSON.stringify(simulateState.details, null, 2) })) : null] })) : null, simulateState.status === "success" ? (_jsxs("div", { className: "space-y-2 text-xs text-muted-foreground", children: [_jsx("pre", { className: "max-h-48 overflow-auto rounded-xl bg-black/60 p-3 text-[11px] text-foreground", children: JSON.stringify(simulateState.spec, null, 2) }), simulateState.needMoreInfo ? (_jsxs("div", { className: "space-y-1 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3", children: [_jsx("p", { className: "text-[11px] font-semibold text-amber-100", children: simulateState.needMoreInfo.title ?? "Informações adicionais requeridas" }), _jsx("p", { className: "text-[11px] text-amber-100/90", children: simulateState.needMoreInfo.message ??
                                                    "Antes de criar o plano, forneça os campos abaixo." }), _jsx("ul", { className: "mt-2 space-y-1 text-[11px] text-amber-100/90", children: simulateState.needMoreInfo.fields.map((field) => (_jsxs("li", { className: "rounded-lg border border-amber-400/30 px-2 py-1", children: [_jsx("span", { className: "font-semibold", children: field.label }), field.helper ? (_jsx("span", { className: "block text-amber-100/70", children: field.helper })) : null] }, field.key))) })] })) : (_jsx("p", { className: "text-[11px] text-emerald-200", children: "Nenhum dado adicional requerido \u2014 pronto para cria\u00E7\u00E3o." }))] })) : null] }), _jsxs("div", { className: "space-y-2 rounded-3xl border border-white/10 bg-black/40 p-4", children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground", children: "Enfileiramento" }), createState.status === "idle" ? (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["Ap\u00F3s validar, envie para cria\u00E7\u00E3o. O worker `apps/workers/action-runner` registrar\u00E1 os eventos ", _jsx("code", { children: "billing.plan.create.*" }), " e o audit log."] })) : null, createState.status === "loading" ? (_jsx("p", { className: "text-xs text-muted-foreground", children: "Enviando plano para o worker\u2026" })) : null, createState.status === "error" ? (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-rose-200", children: createState.message }), createState.details ? (_jsx("pre", { className: "max-h-48 overflow-auto rounded-xl bg-black/60 p-3 text-[11px] text-muted-foreground", children: JSON.stringify(createState.details, null, 2) })) : null] })) : null, createState.status === "success" ? (_jsxs("div", { className: "space-y-2 text-xs text-muted-foreground", children: [_jsxs("p", { className: "text-foreground", children: ["Plano ", _jsx("span", { className: "font-semibold text-accent", children: createState.planId }), " enviado com sucesso."] }), _jsxs("p", { children: ["Job ID:", " ", _jsx("span", { className: "font-mono", children: createState.jobId !== null ? createState.jobId : "—" })] }), _jsxs("p", { children: ["Idempotency key:", " ", _jsx("span", { className: "font-mono", children: createState.idempotencyKey || "—" })] }), _jsxs("p", { children: ["Necessita dados adicionais?", " ", _jsx("span", { className: "font-semibold", children: createState.needsAdditionalInfo ? "Sim" : "Não" })] }), _jsx("p", { className: "text-[11px] text-muted-foreground", children: "Acompanhe o run correspondente na lista de execu\u00E7\u00F5es para visualizar o retorno do worker e os logs de auditoria." })] })) : null] })] })] }));
}
export default function SelfServiceFinNexusPage() {
    const initialValues = useMemo(() => finNexusInitialValues, []);
    const buildRequest = useCallback((values) => {
        const lines = [
            "Missão: Você é o FinNexus, a inteligência central especializada em criar, gerenciar, automatizar e conciliar todos os aspectos de Pagamentos, Recebíveis, Faturamento e Descontos dentro da plataforma EIAH. Sua missão é garantir a precisão financeira, a conformidade legal e a personalização white-label para cada cliente, atuando sempre com a máxima segurança e auditabilidade.",
            "",
            "1. Princípios de Governança e Auditabilidade (Não Negociável)",
            "Contexto Multi-Tenant: Toda a sua execução deve ser validada pelo contexto de segurança: tenantId, workspaceId, userId. Verifique as permissões de billing.admin ou editor antes de executar qualquer Action que altere o estado financeiro.",
            "Auditabilidade Total: Para cada passo do ciclo de cobrança (criação de plano, conciliação, envio de fatura), emita um registro de auditoria completo (emit_audit_log Tool). O log deve incluir: tenantId, workspaceId, runId, traceId, a action executada e o costCents.",
            "Idempotência: Garanta que todas as chamadas críticas às Actions (ex: billing.charge_customer) usem a chave de idempotência gerada por hash(request_payload) para prevenir cobranças duplicadas.",
            "Resiliência: Em caso de falha de gateway ou erro de conciliação, registre o evento com severidade CRÍTICA, aplique a estratégia de retry/backoff (interna ao Core) e notifique o usuário e o administrador via apps/workers.",
            "",
            "2. Fluxo de Criação de Plano e Regras (Plan Orchestration)",
            "Validação Obrigatória de Entradas (need_more_info Fallback): Sempre valide os seguintes campos usando o white_label_schema e as regras de negócio do EIAH. Se qualquer dado essencial estiver ausente ou inválido, retorne o erro imediatamente (explain_and_request_missing_fields).",
            "Construção da Spec e Ação: Seu objetivo é transformar a intenção do usuário em um JSON final (Plan Spec) completo, contendo: plan_id, name, amount, currency, interval, o objeto completo branding{} e rules{}. Use a ferramenta create_white_label_plan apenas após o JSON final estar validado e completo. Esta Action é a única forma de criar o plano no Gateway de Pagamento e registrar o evento no BillingLedger.",
            "",
            "3. Personalização White-Label (Core Value)",
            "Implementação: Utilize os campos fornecidos na seção branding do JSON de saída.",
            "Aplicação: Injete o brand_name, logo_url, primary_color e email_from nos templates usados pelas Actions (Ex: generate_pdf_invoice e send_email_receipt).",
            "Textos Customizados: Use os custom_texts (como invoice_title ou payment_success) para personalizar a linguagem nas comunicações de saída.",
            "",
            "4. Gestão do Ciclo de Vida (Operações)",
            "Conciliação: Periodicamente (ou sob demanda), execute a Action billing.reconcile_gateway para garantir que o BillingLedger interno esteja alinhado com o estado do Gateway de Pagamento.",
            "Monitoramento de Quota: Após a criação de um plano, use billing.update_plan_quota para definir os limites de consumo do PlanQuota do cliente.",
            "Comunicação em Tempo Real: Garanta que o progresso do ciclo (Ex.: 'Plano criado', 'Fatura enviada', 'Pagamento falhou') seja emitido em tempo real via SSE (/api/runs/:id/stream).",
            "",
            "Instrução Final: Seja rigoroso com a validação do schema e utilize sua inteligência para resolver ambiguidades na request do usuário, sempre priorizando a segurança financeira e a clareza da comunicação white-label.",
            "",
            "Contexto do usuário para esta execução:",
            `Decisão ou análise financeira central: ${values.question || "não informado"}.`,
            `Carteira ou estrutura financeira atual: ${values.portfolio || "não informado"}.`,
            `Horizonte e meta operacional: ${values.horizon || "não informado"}.`,
            `Parâmetros e tolerância a risco: ${values.riskTolerance || "não informado"}.`,
            `Fatores externos ou eventos relevantes: ${values.newsFocus || "não informado"}.`,
            values.notes ? `Observações e instruções adicionais: ${values.notes}.` : "",
        ].filter(Boolean);
        return {
            prompt: lines.join("\n"),
            metadata: {
                domain: "fin_nexus_insights",
                form: values,
            },
        };
    }, []);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(SelfServiceNav, { currentSlug: "fin-nexus" }), _jsx(AgentFormShell, { agentId: "fin-nexus", title: "FinNexus Insight Financeiro", description: "Combine dados de carteira, metas operacionais e toler\u00E2ncia a risco para gerar an\u00E1lises financeiras e instru\u00E7\u00F5es de execu\u00E7\u00E3o audit\u00E1veis pelo FinNexus.", initialValues: initialValues, buildRequest: buildRequest, children: ({ values, setValue }) => (_jsx("div", { className: "space-y-4", children: finNexusFields.map((field) => (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsx("textarea", { value: values[field.key], onChange: (event) => setValue(field.key, event.target.value), placeholder: field.placeholder, rows: field.rows, className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-accent focus:outline-none" })] }, field.key))) })) }), _jsx(PlanBuilder, {})] }));
}
