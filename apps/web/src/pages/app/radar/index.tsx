import React from "react";
import { Link } from "react-router-dom";
import { apiRadarListEntities, type RadarKnownEntity } from "@/lib/api";

const RadarIndexPage: React.FC = () => {
  const [entities, setEntities] = React.useState<RadarKnownEntity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFetchError(null);
    void apiRadarListEntities()
      .then((response) => {
        if (!mounted) return;
        setEntities(response.items ?? []);
      })
      .catch((error) => {
        if (!mounted) return;
        setEntities([]);
        setFetchError(error instanceof Error ? error.message : "Falha ao buscar entidades do Radar");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Radar Social</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Empresas conhecidas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione uma empresa acessível para fornecer material sintético e solicitar uma análise simulada governada.
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Entidades</h2>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? "carregando" : `${entities.length} encontradas`}
          </span>
        </div>
        {fetchError ? <p className="mt-2 text-xs text-rose-200">API indisponível: {fetchError}</p> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {entities.map((entity) => (
            <Link
              key={entity.id}
              to={`/app/radar/${encodeURIComponent(entity.id)}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{entity.displayName}</p>
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${
                    entity.status === "active" ? "text-emerald-300 border-emerald-400/40" : "text-muted-foreground border-white/15"
                  }`}
                >
                  {entity.status === "active" ? "ativa" : "inativa"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{entity.externalRef ?? "sem referência externa"}</p>
            </Link>
          ))}
        </div>

        {!loading && entities.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            {fetchError
              ? "Não foi possível carregar as entidades."
              : "Nenhuma entidade acessível — grants concedidos a este usuário sintético controlam o que aparece aqui."}
          </p>
        ) : null}
      </section>
    </div>
  );
};

export default RadarIndexPage;
