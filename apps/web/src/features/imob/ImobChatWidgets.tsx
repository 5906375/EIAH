import React from "react";
import type {
  ImobCase,
  ImobCommercialHomeWidget,
  ImobResolvedBackingSpecialist,
  ImobPresentationWidget,
} from "@/lib/api";
import { getImobPropertyTypeLabel } from "./propertyTypes";

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

function renderSpecialists(specialists: ImobResolvedBackingSpecialist[]) {
  if (!specialists.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Apoios contextuais</p>
      {specialists.map((item) => (
        <div key={item.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
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
          {item.suggestedAction ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Ação sugerida: {item.suggestedAction}</p>
          ) : null}
        </div>
      ))}
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
      </div>
    );
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
    </div>
  );
};
