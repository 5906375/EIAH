import React from "react";
import { Link } from "react-router-dom";
import { selfServiceConfigs } from "./config";
import eiahAgentsVideo from "../../assets/eiah-agentes.mp4";
import eiahMarketingVideo from "../../assets/eiah-marketing.mp4";
import eiahJ360Video from "../../assets/eiah-j360.mp4";
import eiahFlowOrchestratorVideo from "../../assets/eiah-flow-orchestrator.mp4";
import eiahRiskAnalyzerVideo from "../../assets/eiah-risk-analyzer.mp4";
import eiahOnchainMonitorVideo from "../../assets/eiah-onchain-monitor.mp4";
import eiahIBCVideo from "../../assets/eiah-i-bc.mp4";
import eiahDiariasVideo from "../../assets/eiah-diarias.mp4";
import eiahNftPyVideo from "../../assets/eiah-nft-py.mp4";
import eiahImagenftDiariasVideo from "../../assets/eiah-imagenftdiarias.mp4";
import eiahDefiVideo from "../../assets/eiah-defi.mp4";
import eiahPitchVideo from "../../assets/eiah-pitch.mp4";
import eiahCoreVideo from "../../assets/eiah-core.mp4";
import eiahGeralVideo from "../../assets/eiah-geral.mp4";
import SelfServiceNav from "./components/SelfServiceNav";

const primaryAgent = selfServiceConfigs[0];
const agentArtwork: Record<string, string> = {};
const agentVideoMap: Record<string, string> = {
  mkt: eiahMarketingVideo,
  j360: eiahJ360Video,
  "flow-orchestrator": eiahFlowOrchestratorVideo,
  "risk-analyzer": eiahRiskAnalyzerVideo,
  guardian: eiahCoreVideo,
  "fin-nexus": eiahGeralVideo,
  "onchain-monitor": eiahOnchainMonitorVideo,
  "i-bc": eiahIBCVideo,
  diarias: eiahDiariasVideo,
  "nft-py": eiahNftPyVideo,
  imagenftdiarias: eiahImagenftDiariasVideo,
  "defi-1": eiahDefiVideo,
  pitch: eiahPitchVideo,
  eiah: eiahCoreVideo,
};

export default function SelfServiceIndexPage() {
  return (
    <div className="space-y-10">
      

      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Consultoria assistida por IA</p>
        <div className="mt-0.3 grid gap-6 md:grid-cols-[1.6fr,1fr] md:items-center">

          <div className="space-y-16"> {/* Ajustado para space-y-10 para espaçamento entre título e parágrafo */}
            <h1 className="text-4xl font-display font-semibold tracking-[0.09em] text-foreground md:text-5xl md:tracking-[0.07em]">
              Transforme ideias em planos acionáveis em minutos
            </h1>
            <p className="text-base leading-relaxed tracking-[0.03em] text-muted-foreground md:text-lg md:tracking-[0.05em]">
              Escolha um agente especializado, preencha um formulário guiado e receba um plano pronto com histórico auditável.
              Sem esperar consultorias, sem aprender prompts complexos.
            </p>

            {/* AQUI ESTÃO AS ALTERAÇÕES: mt-12 para descer e justify-center para centralizar */}
            <div className="flex flex-wrap gap-4 md:gap-6 mt-12 justify-center">
              {primaryAgent ? (
                <Link
                  to={`/self-service/${primaryAgent.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30"
                >
                  Começar agora
                </Link>
              ) : null}
              <a
                href="admin@carlos-alberto-merlo.com"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
              >
                Falar com especialista
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/70 shadow-lg shadow-accent/10">
              <video
                className="h-full w-full object-cover"
                src={eiahAgentsVideo}
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
            <div className="rounded-3xl border border-white/10 bg-surface/70 p-5 shadow-lg shadow-accent/10">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Como funciona</p>
              <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li>
                  <span className="font-semibold text-foreground">1.</span> Escolha um plano pronto ( Pitch, Compliance,
                  DeFi, Monitoramento)
                </li>
                <li>
                  <span className="font-semibold text-foreground">2.</span> Responda perguntas simples traduzidas do jargão
                  técnico
                </li>
                <li>
                  <span className="font-semibold text-foreground">3.</span> Receba relatório + plano de ação em {"< 2"} minutos,
                  com histórico e custo estimado
                </li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {selfServiceConfigs.map((config) => {
          const artworkSrc = agentArtwork[config.slug];
          const cardVideoSrc = agentVideoMap[config.slug];
          const isJ360 = config.slug === "j360" && artworkSrc;

          if (isJ360) {
            return (
              <Link
                key={config.slug}
                to={`/self-service/${config.slug}`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1527] p-6 transition hover:border-accent/60 hover:bg-[#0f2039]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" aria-hidden />
                <div className="relative z-10 flex min-h-[260px] flex-col justify-between gap-6 pr-40">
                  <div className="space-y-4">
                    <span className="pill inline-block bg-accent/20 text-[10px] uppercase tracking-[0.25em] text-accent">
                      {config.label}
                    </span>
                    <div className="space-y-3">
                      <h2 className="text-2xl font-semibold text-foreground">{config.title}</h2>
                      <p className="text-sm leading-relaxed text-foreground/80">{config.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">
                      Interagir com Agente
                      <span aria-hidden>→</span>
                    </span>
                    <span className="text-2xl font-bold text-white">J_360</span>
                  </div>
                </div>
                <img
                  src={artworkSrc}
                  alt="Agente J_360"
                  className="pointer-events-none absolute top-6 right-6 h-48 w-auto drop-shadow-[0_28px_38px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </Link>
            );
          }

          return (
            <Link
              key={config.slug}
              to={`/self-service/${config.slug}`}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-surface/70 p-5 transition hover:border-accent/50 hover:bg-accent/10"
            >
              {artworkSrc ? (
                <img
                  src={artworkSrc}
                  alt="Ilustração do agente"
                  className="pointer-events-none absolute -bottom-8 -right-6 w-32 opacity-40 transition duration-300 group-hover:scale-105 group-hover:opacity-70"
                  loading="lazy"
                />
              ) : null}
              <div className="mb-3 flex items-center gap-3">
                <span className="pill inline-block bg-accent/20 text-[10px] uppercase tracking-[0.25em] text-accent">
                  {config.label}
                </span>
                {cardVideoSrc ? (
                  <video
                    className="h-25 w-60 rounded-xl border border-white/10 object-cover shadow-sm shadow-accent/20"
                    src={cardVideoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : null}
              </div>
              <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Interagir com Agente
                <span aria-hidden>→</span>
              </span>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-surface/60 p-6 md:grid-cols-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Plano Starter</h3>
          <p className="mt-1 text-sm text-muted-foreground">50 execuções/mês + 3 formulários</p>
          <p className="mt-2 text-xl font-semibold text-accent">R$ 49/mês</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Plano Pro</h3>
          <p className="mt-1 text-sm text-muted-foreground">200 execuções/mês, todos os agentes, export CSV/JSON</p>
          <p className="mt-2 text-xl font-semibold text-accent">R$ 149/mês</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Add-ons</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Acoes externas (Slack, PagerDuty, DeFi) cobradas por uso. Alertas proativos e memorias persistentes.
          </p>
          <a
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent"
            href="mailto:contato@eiah.ai"
          >
            Solicitar proposta
                <span aria-hidden>→</span>
          </a>
        </div>
      </section>
    </div>
  );
}




