import React from "react";
import { Link } from "react-router-dom";
import type { ImobKnowledgeSearchItem } from "@/lib/api";

export type KnowledgeAction = {
  id: string;
  label: string;
  href: string;
};

type KnowledgeCardProps = {
  item: ImobKnowledgeSearchItem;
  sourceActions?: KnowledgeAction[];
};

function renderAction(action: KnowledgeAction, itemId: string) {
  return /^https?:\/\//i.test(action.href) ? (
    <a
      key={`${itemId}-${action.id}`}
      href={action.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
    >
      {action.label}
    </a>
  ) : (
    <Link
      key={`${itemId}-${action.id}`}
      to={action.href}
      className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-white/30"
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

export const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  item,
  sourceActions = [],
}) => {
  return (
    <article className="rounded-xl border border-white/10 bg-black/15 p-3">
      <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.snippet}</p>

      <dl className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-[0.15em] text-[10px]">Região</dt>
          <dd className="mt-1 text-foreground">{item.region}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.15em] text-[10px]">Operação</dt>
          <dd className="mt-1 text-foreground">{operationTypeLabel(item.operationType)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {sourceActions.map((action) => renderAction(action, item.id))}
      </div>
    </article>
  );
};
