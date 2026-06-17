import React from "react";
import { Link } from "react-router-dom";
import { apiListImobProperties, type ImobProperty } from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type PropertyStatus = "available" | "reserved" | "contract";

type PropertyRow = {
  id: string;
  title: string;
  city: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  status: PropertyStatus;
  ownerName: string | null;
};

function mapImobPropertyStatus(raw: string | null | undefined): PropertyStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "reserved") return "reserved";
  if (s === "contract" || s === "sold" || s === "completed") return "contract";
  return "available";
}

function mapImobProperty(item: ImobProperty): PropertyRow {
  const address = item.address?.trim();
  const title =
    address ||
    [item.propertyType, item.neighborhood].filter(Boolean).join(" – ") ||
    "Imóvel em cadastro";
  return {
    id: item.id,
    title,
    city: item.city ?? "",
    neighborhood: item.neighborhood ?? "",
    bedrooms: item.bedrooms ?? 0,
    bathrooms: item.bathrooms ?? 0,
    price: Math.round((item.askingPriceCents ?? 0) / 100),
    status: mapImobPropertyStatus(item.status),
    ownerName: item.owner?.name?.trim() ?? null,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(status: PropertyStatus) {
  if (status === "available") return "Disponível";
  if (status === "reserved") return "Reservado";
  return "Em contrato";
}

function statusTone(status: PropertyStatus) {
  if (status === "contract") return "text-emerald-300 border-emerald-400/40";
  if (status === "reserved") return "text-amber-200 border-amber-300/30";
  return "text-accent border-accent/40";
}

const ImobPropertiesPage: React.FC = () => {
  const session = useSession();
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | PropertyStatus>("all");
  const [properties, setProperties] = React.useState<PropertyRow[]>([]);
  const [source, setSource] = React.useState<"real" | "empty">("empty");
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFetchError(null);

    void apiListImobProperties()
      .then((response) => {
        if (!mounted) return;
        const items = response.data.items ?? [];
        setProperties(items.map(mapImobProperty));
        setSource(items.length > 0 ? "real" : "empty");
      })
      .catch((error) => {
        if (!mounted) return;
        setProperties([]);
        setSource("empty");
        setFetchError(error instanceof Error ? error.message : "Falha ao buscar imóveis");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = properties.filter((item) => {
    const search = query.trim().toLowerCase();
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search) ||
      item.city.toLowerCase().includes(search) ||
      item.neighborhood.toLowerCase().includes(search) ||
      item.id.toLowerCase().includes(search);
    const matchesStatus = status === "all" ? true : item.status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <div className="mb-3">
          <Link
            to="/app/imob/chat"
            className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground transition hover:border-accent/40"
          >
            Voltar
          </Link>
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-accent">IMOB</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Imoveis</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cadastre, filtre e acompanhe os imóveis do seu workspace.</p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brandName} • {workspaceLabel}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Imóveis ativos</p>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {loading ? "loading" : source === "real" ? "backend" : "sem dados"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{properties.length}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Disponíveis</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {properties.filter((item) => item.status === "available").length}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com proprietário</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {properties.filter((item) => Boolean(item.ownerName)).length}
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Carteira de imóveis</h2>
          <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? "loading" : source === "real" ? "backend" : "sem dados"}
          </span>
        </div>
        {fetchError ? <p className="mt-2 text-xs text-rose-200">API indisponível: {fetchError}</p> : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,200px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por código, cidade, bairro..."
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | PropertyStatus)}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none"
          >
            <option value="all">Todos os status</option>
            <option value="available">Disponível</option>
            <option value="reserved">Reservado</option>
            <option value="contract">Em contrato</option>
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.city} • {item.neighborhood}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${statusTone(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold text-foreground">{formatCurrency(item.price)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.bedrooms} quartos • {item.bathrooms} banheiros • código {item.id}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.ownerName ? `Proprietário: ${item.ownerName}` : "Sem proprietário vinculado"}
              </p>
            </article>
          ))}
        </div>

        {!loading && filtered.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            {fetchError
              ? "Não foi possível carregar os imóveis."
              : properties.length === 0
                ? "Nenhum imóvel cadastrado no workspace."
                : "Nenhum imóvel encontrado com esse filtro."}
          </p>
        ) : null}
      </section>
    </div>
  );
};

export default ImobPropertiesPage;
