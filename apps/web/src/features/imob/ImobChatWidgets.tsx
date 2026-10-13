import React from "react";
import type {
  ImobCase,
  ImobCommercialHomeWidget,
  ImobResolvedBackingSpecialist,
  ImobPresentationWidget,
  ImobTransversalCapability,
} from "@/lib/api";
import { getImobPropertyTypeLabel } from "./propertyTypes";
import { ImobContractIntakeDraftCard } from "./ImobContractIntakeDraftCard";
import { ImobContractIntakeResultCard } from "./ImobContractIntakeResultCard";

type WidgetAction = {
  id: string;
  label: string;
  autoprompt: string;
};

type Props = {
  widget: ImobPresentationWidget;
  onAction: (action: WidgetAction) => void;
};

function formatPriorityCaseDetail(item: ImobCase) {
  const context = item.lead?.name || item.owner?.name || item.property?.city || "caso operacional";
  const nextStep = item.nextStep?.trim() || item.stage || "seguir atendimento";
  return `${context} • ${nextStep}`;
}

function getSpecialistBadgeTone(urgency?: ImobResolvedBackingSpecialist["urgency"]) {
  if (urgency === "high") return "text-amber-200 border-amber-400/30 bg-amber-500/10";
  if (urgency === "medium") return "text-sky-200 border-sky-400/30 bg-sky-500/10";
  return "text-muted-foreground border-white/10 bg-black/10";
}

/** Apenas apresenta o estado já resolvido pelo backend; sem regra de elegibilidade própria. Valor desconhecido = não verificado. */
function normalizeSpecialistAvailability(availability?: string | null): "available" | "unavailable" | "unverified" {
  return availability === "available" || availability === "unavailable" ? availability : "unverified";
}

function getSpecialistAvailabilityNote(availability: "available" | "unavailable" | "unverified") {
  if (availability === "available") return null;
  if (availability === "unavailable") return "Indisponível neste workspace. Este apoio não será acionado.";
  return "Disponibilidade não verificada. Este apoio não será acionado.";
}

function renderSpecialists(specialists: ImobResolvedBackingSpecialist[]) {
  if (!specialists.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Apoios contextuais</p>
      {specialists.map((item) => {
        const availability = normalizeSpecialistAvailability(item.availability);
        return (
          <div key={item.key} data-availability={availability} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-foreground">{item.primaryAgentId}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.responsibility}</p>
              </div>
              {item.urgency ? (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${getSpecialistBadgeTone(item.urgency)}`}>
                  {item.urgency}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-foreground/90">{item.rationale}</p>
            {availability === "available" && item.suggestedAction ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Ação sugerida: {item.suggestedAction}</p>
            ) : null}
            {getSpecialistAvailabilityNote(availability) ? (
              <p className="mt-2 text-[11px] text-amber-200/90">{getSpecialistAvailabilityNote(availability)}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const TRANSVERSAL_STATE_LABEL = {
  habilitado: "Habilitado neste workspace",
  habilitavel: "Habilitável (ainda não habilitado)",
  indisponivel: "Indisponível neste workspace",
  nao_verificado: "Não verificado",
} as const;

const MARKETPLACE_PATH = "/app/marketplace";

/**
 * Apenas apresenta o que o backend descobriu (somente leitura). Estado desconhecido vale "não verificado" e autoridade
 * ausente ou desconhecida vale "somente consulta". O caminho de revisão das condições comerciais só aparece para
 * "habilitável" COM autoridade de contratação resolvida pelo servidor, apontando para o Marketplace, onde a
 * confirmação humana acontece e a API reaplica a autoridade. Sem autoridade só há a recomendação. Esta tela não
 * contrata, não habilita e não solicita aprovação. Habilitar um AGENTE não é convidar uma PESSOA para o workspace.
 */
function renderTransversalCapabilities(items?: ImobTransversalCapability[]) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Especialistas transversais</p>
      {items.map((item) => {
        const state = item.state in TRANSVERSAL_STATE_LABEL ? item.state : "nao_verificado";
        const authorized = item.authority?.status === "contratacao_autorizada";
        const enable = state === "habilitavel" && authorized && item.nextAction?.kind === "review_commercial_terms" && item.nextAction.path === MARKETPLACE_PATH
          ? item.nextAction
          : null;
        const declared = (item.provider?.declaredCapabilities ?? []).slice(0, 3);
        const recipes = item.recipes ?? { status: "nao_aplicavel", items: [] };
        return (
          <div key={item.need.needId} data-capability-state={state} data-capability-authority={authorized ? "contratacao_autorizada" : "somente_consulta"} data-capability-domain={item.need.domain} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-foreground">{item.need.label ?? `${item.need.domain} · ${item.need.capability}`}</p>
                {item.provider ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.provider.name} ({item.provider.agentId})</p>
                ) : null}
              </div>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {TRANSVERSAL_STATE_LABEL[state]}
              </span>
            </div>
            {declared.length > 0 ? (
              <ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground">
                {declared.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            ) : null}
            {recipes.status === "ok" ? (
              recipes.items.length > 0 ? (
                <div className="mt-2 text-[11px] text-foreground/90">
                  <p>Modelos homologados neste workspace:</p>
                  <ul className="list-disc pl-4">
                    {recipes.items.slice(0, 3).map((recipe) => <li key={recipe.id}>{recipe.title}</li>)}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">Nenhum modelo homologado disponível para este workspace.</p>
              )
            ) : recipes.status === "nao_verificado" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Modelos homologados: não verificados.</p>
            ) : null}
            {enable ? (
              <div className="mt-2 text-[11px]">
                {(item.enablement?.conditions ?? []).slice(0, 4).map((condition) => (
                  <p key={condition} className="text-muted-foreground">{condition}</p>
                ))}
                <a href={enable.path} className="mt-2 inline-block underline text-foreground">Revisar as condições comerciais no Marketplace</a>
                <p className="mt-1 text-muted-foreground">Você tem autoridade para contratar neste workspace. A contratação só acontece com a sua confirmação no Marketplace. Habilitar um agente não é convidar uma pessoa para o workspace.</p>
              </div>
            ) : state === "habilitavel" ? (
              <div className="mt-2 text-[11px] text-muted-foreground">
                <p>Recomendação: este agente pode ser habilitado neste workspace, mas ainda não está contratado.</p>
                <p className="mt-1">A contratação exige a aprovação de uma pessoa autorizada deste workspace. Esta conversa não contrata nem habilita agentes.</p>
              </div>
            ) : state === "habilitado" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Agente habilitado. O encaminhamento operacional ainda não está disponível nesta versão.</p>
            ) : state === "indisponivel" ? (
              <p className="mt-2 text-[11px] text-amber-200/90">Esta capacidade não pode ser acionada neste workspace.</p>
            ) : (
              <p className="mt-2 text-[11px] text-amber-200/90">Não foi possível verificar esta capacidade. Nenhuma ação é oferecida.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function buildImobCommercialHomeWidget(params: {
  quickActions: ImobCommercialHomeWidget["quickActions"];
  prioritizedCases: ImobCase[];
}): ImobCommercialHomeWidget {
  return {
    kind: "commercial_home",
    title: "",
    subtitle: "",
    quickActions: params.quickActions,
    priorities: params.prioritizedCases.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.canonical?.recommendedActions?.[0]?.label ?? "Revisar caso",
      detail: formatPriorityCaseDetail(item),
      autoprompt:
        item.canonical?.recommendedActions?.[0]?.inputHint?.trim() ||
        item.nextStep?.trim() ||
        "mostrar próximo passo deste caso",
    })),
  };
}

export const ImobChatWidgets: React.FC<Props> = ({ widget, onAction }) => {
  if (widget.kind === "commercial_home") {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          {widget.quickActions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAction({ id: item.id, label: item.title, autoprompt: item.autoprompt })}
              className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-accent/40"
            >
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
            </button>
          ))}
        </div>
        {widget.priorities?.length ? (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Negócios para atacar agora</p>
            {widget.priorities.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAction({ id: item.id, label: item.title, autoprompt: item.autoprompt })}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-accent/40"
              >
                <div>
                  <p className="text-sm text-foreground">{item.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-accent">Abrir</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (widget.kind === "inventory_showcase") {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{widget.title}</p>
        {widget.subtitle ? <p className="mt-2 text-xs text-muted-foreground">{widget.subtitle}</p> : null}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {widget.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAction({ id: item.id, label: item.title, autoprompt: item.autoprompt?.trim() || `mostrar detalhes do imóvel ${item.title}` })}
              className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-accent/40"
            >
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.city}
                {item.neighborhood ? ` • ${item.neighborhood}` : ""} • {item.priceLabel}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {(getImobPropertyTypeLabel(item.propertyType) ?? "imóvel")} • {item.segment === "locacao" ? "locação" : "venda"}
                {item.bedrooms ? ` • ${item.bedrooms}q` : ""}
                {item.bathrooms ? ` • ${item.bathrooms}b` : ""}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (widget.kind === "case_summary") {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{widget.title}</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Jornada</p>
            <p className="mt-1 text-sm text-foreground">{widget.journeyLabel}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Momento</p>
            <p className="mt-1 text-sm text-foreground">{widget.stageLabel}</p>
          </div>
        </div>
        {widget.nextStep ? <p className="mt-3 text-xs text-muted-foreground">Próximo passo: {widget.nextStep}</p> : null}
        {widget.blocker ? <p className="mt-2 text-xs text-rose-200">Bloqueio: {widget.blocker}</p> : null}
        {widget.recommendedActions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {widget.recommendedActions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAction({ id: item.id, label: item.label, autoprompt: item.autoprompt?.trim() || item.label })}
                className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] text-foreground transition hover:border-accent/70"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {renderSpecialists(widget.specialists)}
        {renderTransversalCapabilities(widget.transversalCapabilities)}
      </div>
    );
  }

  if (widget.kind === "contract_intake_draft") {
    return <ImobContractIntakeDraftCard widget={widget} />;
  }

  if (widget.kind === "contract_intake_result") {
    return <ImobContractIntakeResultCard widget={widget} commandCenterHref="/app/imob/cases" />;
  }

  if (widget.kind === "print_bundle") {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{widget.title}</p>
        <div className="mt-3 space-y-2">
          {widget.items.map((item, index) => (
            <div key={`${widget.kind}-${index}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-xs text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{widget.title}</p>
      <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
        {widget.checklist.map((item, index) => (
          <li key={`${widget.kind}-${index}`}>- {item}</li>
        ))}
      </ul>
      {widget.blocker ? <p className="mt-3 text-xs text-rose-200">Bloqueio: {widget.blocker}</p> : null}
      {widget.nextStep ? <p className="mt-2 text-xs text-muted-foreground">Próximo passo: {widget.nextStep}</p> : null}
      {renderSpecialists(widget.specialists)}
      {renderTransversalCapabilities(widget.transversalCapabilities)}
    </div>
  );
};
