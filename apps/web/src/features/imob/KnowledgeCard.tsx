import React from "react";
import { Link } from "react-router-dom";
import type { ImobKnowledgeSearchItem } from "@/lib/api";

type KnowledgeCardProps = {
  item: ImobKnowledgeSearchItem;
  resolveHref?: (href: string) => string;
  onOpenInPlatform?: (item: ImobKnowledgeSearchItem) => void;
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
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export const KnowledgeCard: React.FC<KnowledgeCardProps> = ({ item, resolveHref, onOpenInPlatform }) => {
  const href = resolveHref ? resolveHref(item.href) : item.href;
  const openExternalLabel = item.sourceType === "drive" ? "Abrir no Drive" : "Abrir documento";

  return (
    <article className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
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

      <h4 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h4>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.snippet}</p>

      <dl className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-[0.15em] text-[10px]">Região</dt>
          <dd className="mt-1 text-foreground">{item.region}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.15em] text-[10px]">Operação</dt>
          <dd className="mt-1 text-foreground">{item.operationType}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="uppercase tracking-[0.15em] text-[10px]">Tags</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
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
              <span className="text-foreground">Sem tags</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="uppercase tracking-[0.15em] text-[10px]">Atualizado</dt>
          <dd className="mt-1 text-foreground">{formatUpdatedAt(item.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenInPlatform?.(item)}
          className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/60"
        >
          Abrir no IMOB
        </button>
        {isExternalHref(href) ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
          >
            {openExternalLabel}
          </a>
        ) : (
          <Link
            to={href}
            className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
          >
            {openExternalLabel}
          </Link>
        )}
      </div>
    </article>
  );
};
