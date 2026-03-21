import React from "react";
import { Link } from "react-router-dom";
import type { ImobKnowledgeSearchItem } from "@/lib/api";
import type { KnowledgeAction } from "./KnowledgeCard";

type ImobKnowledgeViewerProps = {
  item: ImobKnowledgeSearchItem | null;
  open: boolean;
  onClose: () => void;
  resolveHref?: (href: string) => string;
  sourceActions?: KnowledgeAction[];
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function renderAction(action: KnowledgeAction, itemId: string) {
  return isExternalHref(action.href) ? (
    <a
      key={`${itemId}-${action.id}`}
      href={action.href}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
    >
      {action.label}
    </a>
  ) : (
    <Link
      key={`${itemId}-${action.id}`}
      to={action.href}
      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
    >
      {action.label}
    </Link>
  );
}

function operationTypeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "locacao") return "Locação";
  if (normalized === "venda") return "Venda";
  if (normalized === "captacao") return "Captação";
  if (normalized === "proposta") return "Proposta";
  return value;
}

function externalActionLabel(item: ImobKnowledgeSearchItem, href: string) {
  if (item.sourceType !== "drive") return "Abrir documento";
  if (/\/file\/d\//i.test(href) || /open\?id=/i.test(href)) return "Abrir no Drive";
  if (/\/drive\/folders\//i.test(href)) return "Abrir pasta no Drive";
  return "Buscar no Drive";
}

export const ImobKnowledgeViewer: React.FC<ImobKnowledgeViewerProps> = ({
  item,
  open,
  onClose,
  resolveHref,
  sourceActions = [],
}) => {
  if (!open || !item) return null;
  const href = resolveHref ? resolveHref(item.href) : item.href;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-surface/95 shadow-2xl shadow-black/50">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-accent/80">Visualizador IMOB</p>
            <h2 className="text-xl font-semibold text-foreground">{item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-white/30"
          >
            Fechar
          </button>
        </header>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resumo</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{item.snippet}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ações</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {isExternalHref(href) ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/60"
                  >
                    {externalActionLabel(item, href)}
                  </a>
                ) : (
                  <Link
                    to={href}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/60"
                  >
                    Abrir documento
                  </Link>
                )}
                {sourceActions.map((action) => renderAction(action, item.id))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Contexto</p>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Região</dt>
                  <dd className="mt-1 text-foreground">{item.region}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Operação</dt>
                  <dd className="mt-1 text-foreground">{operationTypeLabel(item.operationType)}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
