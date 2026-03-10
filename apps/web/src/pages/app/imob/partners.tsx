import React from "react";
import { apiListDelegations, type DelegationPolicy } from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type PartnerRow = {
  id: string;
  name: string;
  city: string;
  trustScore: number;
  activeCases: number;
  splitDefault: string;
  status: string;
};

const syntheticPartners: PartnerRow[] = [
  {
    id: "partner-prime",
    name: "Prime Imóveis",
    city: "Itapema",
    trustScore: 92,
    activeCases: 4,
    splitDefault: "50/50",
    status: "ativo",
  },
  {
    id: "partner-litoral",
    name: "Litoral Brokers",
    city: "Balneário Camboriú",
    trustScore: 87,
    activeCases: 2,
    splitDefault: "60/40",
    status: "ativo",
  },
  {
    id: "partner-atlantica",
    name: "Atlântica Realty",
    city: "Porto Belo",
    trustScore: 78,
    activeCases: 1,
    splitDefault: "50/50",
    status: "em revisão",
  },
];

function mapDelegationsToPartners(items: DelegationPolicy[]): PartnerRow[] {
  const byPartner = new Map<string, PartnerRow>();

  for (const item of items) {
    const partnerKey = item.delegateeId || item.delegatorId || item.id;
    const partnerName = item.publisherName || item.marketplaceName || item.delegateeId || "Parceiro da rede";
    const existing = byPartner.get(partnerKey);
    const status = new Date(item.validUntil).getTime() > Date.now() ? "ativo" : "expirado";
    const derivedTrust = Number.isFinite(item.trustMin) ? Math.max(0, Math.min(100, item.trustMin)) : 70;

    if (!existing) {
      byPartner.set(partnerKey, {
        id: partnerKey,
        name: partnerName,
        city: "Rede EIAH",
        trustScore: derivedTrust,
        activeCases: 1,
        splitDefault: item.scope === "admin" ? "50/50" : item.scope === "execute" ? "60/40" : "70/30",
        status,
      });
      continue;
    }

    existing.activeCases += 1;
    existing.trustScore = Math.round((existing.trustScore + derivedTrust) / 2);
    if (status === "ativo") {
      existing.status = "ativo";
    }
  }

  return Array.from(byPartner.values());
}

const ImobPartnersPage: React.FC = () => {
  const session = useSession();
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [partners, setPartners] = React.useState<PartnerRow[]>(syntheticPartners);
  const [source, setSource] = React.useState<"real" | "fallback">("fallback");
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFetchError(null);

    void apiListDelegations({ role: "all", workspaceScoped: true })
      .then((response) => {
        if (!mounted) return;
        const mapped = mapDelegationsToPartners(response.items ?? []);
        if (mapped.length > 0) {
          setPartners(mapped);
          setSource("real");
        } else {
          setPartners(syntheticPartners);
          setSource("fallback");
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setPartners(syntheticPartners);
        setSource("fallback");
        setFetchError(error instanceof Error ? error.message : "Falha ao buscar parceiros");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const activePartners = partners.filter((item) => item.status === "ativo").length;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">IMOB</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Parceiros</h1>
        <p className="mt-2 text-sm text-muted-foreground">Rede de parceiros e colaboração entre imobiliárias.</p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brandName} • {workspaceLabel}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Parceiros ativos</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{activePartners}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Casos em parceria</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {partners.reduce((sum, item) => sum + item.activeCases, 0)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Trust médio da rede</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {Math.round(partners.reduce((sum, item) => sum + item.trustScore, 0) / partners.length)}
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rede de parceiros</h2>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? "loading" : source === "real" ? "backend" : "fallback"}
          </span>
        </div>
        {fetchError ? <p className="mt-2 text-xs text-rose-200">API indisponível: {fetchError}</p> : null}

        <div className="mt-4 grid gap-3">
          {partners.map((partner) => (
            <article key={partner.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{partner.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {partner.city} • split padrão {partner.splitDefault}
                  </p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {partner.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-white/10 bg-surface/50 px-2 py-1">Trust {partner.trustScore}</span>
                <span className="rounded-full border border-white/10 bg-surface/50 px-2 py-1">{partner.activeCases} processos ativos</span>
                <span className="rounded-full border border-white/10 bg-surface/50 px-2 py-1">scope: execute</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ImobPartnersPage;
