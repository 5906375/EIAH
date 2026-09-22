import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  apiRadarCreateAnalysisRequest,
  apiRadarGetEntity,
  apiRadarReceiveMaterial,
  radarNewOperationKey,
  type RadarKnownEntity,
  type RadarMaterial,
} from "@/lib/api";

const RadarEntityPage: React.FC = () => {
  const { entityId = "" } = useParams<{ entityId: string }>();
  const navigate = useNavigate();

  const [entity, setEntity] = React.useState<RadarKnownEntity | null>(null);
  const [materials, setMaterials] = React.useState<RadarMaterial[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const [conteudo, setConteudo] = React.useState("");
  const [fonteDeclarada, setFonteDeclarada] = React.useState("");
  const [materialSubmitting, setMaterialSubmitting] = React.useState(false);
  const [materialError, setMaterialError] = React.useState<string | null>(null);

  const [selectedMaterialId, setSelectedMaterialId] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [requestSubmitting, setRequestSubmitting] = React.useState(false);
  const [requestError, setRequestError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setFetchError(null);
    return apiRadarGetEntity(entityId)
      .then((response) => {
        setEntity(response.entity);
        setMaterials(response.materials ?? []);
        setSelectedMaterialId((current) => current || response.materials?.[0]?.id || "");
      })
      .catch((error) => {
        setEntity(null);
        setMaterials([]);
        setFetchError(error instanceof Error ? error.message : "Entidade não encontrada ou sem acesso");
      })
      .finally(() => setLoading(false));
  }, [entityId]);

  React.useEffect(() => {
    let mounted = true;
    void load().then(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  async function handleSubmitMaterial(event: React.FormEvent) {
    event.preventDefault();
    setMaterialSubmitting(true);
    setMaterialError(null);
    try {
      await apiRadarReceiveMaterial(entityId, {
        conteudo,
        fonteDeclarada,
        operationKey: radarNewOperationKey(),
      });
      setConteudo("");
      setFonteDeclarada("");
      await load();
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Falha ao enviar material");
    } finally {
      setMaterialSubmitting(false);
    }
  }

  async function handleSubmitRequest(event: React.FormEvent) {
    event.preventDefault();
    setRequestSubmitting(true);
    setRequestError(null);
    try {
      const result = await apiRadarCreateAnalysisRequest(entityId, {
        materialId: selectedMaterialId,
        objective,
        operationKey: radarNewOperationKey(),
      });
      navigate(`/app/radar/${encodeURIComponent(entityId)}/requests/${encodeURIComponent(result.request.id)}`);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Falha ao solicitar análise");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/radar" className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
          ← Voltar às entidades
        </Link>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {fetchError ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-sm text-rose-200">{fetchError}</p>
      ) : null}

      {entity ? (
        <>
          <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Radar Social</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">{entity.displayName}</h1>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              status: {entity.status === "active" ? "ativa" : "inativa"}
            </p>
          </header>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Material sintético</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Conteúdo fictício, fornecido manualmente para esta demonstração — nunca coletado de fonte real.
            </p>
            <form onSubmit={handleSubmitMaterial} className="mt-4 space-y-3">
              <textarea
                required
                disabled={entity.status !== "active"}
                value={conteudo}
                onChange={(event) => setConteudo(event.target.value)}
                placeholder="Cole aqui o texto sintético do material..."
                rows={5}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
              />
              <input
                required
                disabled={entity.status !== "active"}
                value={fonteDeclarada}
                onChange={(event) => setFonteDeclarada(event.target.value)}
                placeholder="Fonte declarada (ex.: 'perfil público simulado')"
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
              />
              {entity.status !== "active" ? (
                <p className="text-xs text-amber-200">Entidade inativa — não é possível enviar novo material.</p>
              ) : null}
              {materialError ? <p className="text-xs text-rose-200">{materialError}</p> : null}
              <button
                type="submit"
                disabled={materialSubmitting || entity.status !== "active"}
                className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                {materialSubmitting ? "Enviando..." : "Enviar material"}
              </button>
            </form>

            <div className="mt-6 space-y-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Materiais recebidos</h3>
              {materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum material recebido ainda.</p>
              ) : (
                materials.map((material) => (
                  <article key={material.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      {material.fonteDeclarada} • recebido em {new Date(material.recebidoEm).toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{material.conteudo}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nova solicitação de análise</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Aciona a execução GOVERNADA (transporte substituído, sem modelo real) — ver banner desta seção.
            </p>
            <form onSubmit={handleSubmitRequest} className="mt-4 space-y-3">
              <select
                required
                value={selectedMaterialId}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none"
              >
                <option value="" disabled>
                  Selecione o material
                </option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.fonteDeclarada} — {material.conteudo.slice(0, 40)}...
                  </option>
                ))}
              </select>
              <input
                required
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Objetivo da análise (ex.: 'avaliar sinais de risco')"
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
              />
              {requestError ? <p className="text-xs text-rose-200">{requestError}</p> : null}
              <button
                type="submit"
                disabled={requestSubmitting || materials.length === 0}
                className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                {requestSubmitting ? "Solicitando..." : "Solicitar análise simulada"}
              </button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default RadarEntityPage;
