import React from "react";
import { Link } from "react-router-dom";
import { selfServiceConfigs } from "../config";

export default function SelfServiceNav({ currentSlug }: { currentSlug?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
      <span>Self-service</span>
      <span className="text-accent">/</span>
      {selfServiceConfigs.map((item, index) => {
        const isCurrent = item.slug === currentSlug;
        const label = (item.label?.trim() || item.title || item.agentId).trim();
        const separator = index === selfServiceConfigs.length - 1 ? null : (
          <span key={`${item.slug}-sep`} className="text-accent">
            /
          </span>
        );
        return (
          <React.Fragment key={item.slug}>
            {isCurrent ? (
              <span className="text-accent">{label}</span>
            ) : (
              <Link to={`/self-service/${item.slug}`} className="hover:text-foreground">
                {label}
              </Link>
            )}
            {separator}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
