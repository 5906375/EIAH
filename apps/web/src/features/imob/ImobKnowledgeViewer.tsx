import React from "react";
import { Link } from "react-router-dom";
import type { ImobKnowledgeSearchItem } from "@/lib/api";

type ImobKnowledgeViewerProps = {
  item: ImobKnowledgeSearchItem | null;
  open: boolean;
  onClose: () => void;
  resolveHref?: (href: string) => string;
};

function sourceTypeLabel(sourceType: ImobKnowledgeSearchItem["sourceType"]) {
  switch (sourceType) {
    case "drive":
      return "Drive";
    case "upload":
      return "Arquivo";
    case "web":
      return "Web";
    case "internal_doc":
    default:
      return "Interno";
  }
}

function segmentLabel(segment: ImobKnowledgeSearchItem["segment"]) {
  switch (segment) {
    case "locacao":
      return "Locação";
    case "venda":
      return "Venda";
    case "ambos":
    default:
      return "Locação e venda";
  }
}

function formatUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(parsed);
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export const ImobKnowledgeViewer: React.FC<ImobKnowledgeViewerProps> = ({
  item,
  open,
  onClose,
  resolveHref,
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
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                {sourceTypeLabel(item.sourceType)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {item.documentType}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {segmentLabel(item.segment)}
              </span>
            </div>
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
                    {item.sourceType === "drive" ? "Abrir no Drive" : "Abrir documento"}
                  </a>
                ) : (
                  <Link
                    to={href}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/60"
                  >
                    Abrir documento
                  </Link>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Metadados</p>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Região</dt>
                  <dd className="mt-1 text-foreground">{item.region}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Operação</dt>
                  <dd className="mt-1 text-foreground">{item.operationType}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Atualizado</dt>
                  <dd className="mt-1 text-foreground">{formatUpdatedAt(item.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.length > 0 ? (
                  item.tags.map((tag) => (
                    <span
                      key={`${item.id}-${tag}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-foreground">Sem tags</span>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
