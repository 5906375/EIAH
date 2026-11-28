import { type PrismaClient, prismaGlobal } from "@repo/db";
import {
  verifyRadarDemoDbMarker,
  RADAR_DEMO_DB_MARKER_ENV_KEY,
} from "../services/radarSocial/radarDemoDbMarker";

export const RADAR_DEMO_MODE_ENV_KEY = "RADAR_DEMO_MODE" as const;

/**
 * Gate SÍNCRONO de montagem — mesma técnica já usada por
 * isChatVerticalImobRuntimeShadowRouteEnabled (chatVerticalImobRuntimeShadowGate.ts):
 * desabilitado por padrão, exige ativação explícita, recusa produção e
 * configuração incompleta. Aceita um `env` injetável para ser testável sem
 * mutar process.env global. Não depende de nenhum dado sintético existir —
 * só de variáveis de processo — e não substitui a verificação assíncrona do
 * banco abaixo: a mera presença de RADAR_DEMO_MODE=1 nunca é suficiente
 * sozinha (docs/architecture/radar-social-construction-plan-v1.md,
 * "Precisões de isolamento — rodada 2", seção A).
 */
export function isRadarSocialDemoModeSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[RADAR_DEMO_MODE_ENV_KEY] !== "1") return false;
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test") return false;
  const marker = env[RADAR_DEMO_DB_MARKER_ENV_KEY];
  return typeof marker === "string" && marker.trim().length > 0;
}

// Verificação ASSÍNCRONA do vínculo com o banco descartável, cacheada por
// processo (uma consulta por vida do processo, nunca uma por requisição) —
// nenhuma rota abaixo lê/escreve qualquer tabela do Radar antes desta
// verificação resolver `true`. Ver radarDemoDbMarker.ts.
let cachedVerification: Promise<boolean> | null = null;

/** Só para teste — nunca chamado por código de produção. */
export function resetRadarSocialDemoDbVerificationCacheForTesting(): void {
  cachedVerification = null;
}

export async function isRadarSocialDemoDbVerified(
  db: PrismaClient = prismaGlobal,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!isRadarSocialDemoModeSyncEnabled(env)) return false;
  if (!cachedVerification) {
    const marker = env[RADAR_DEMO_DB_MARKER_ENV_KEY];
    cachedVerification = verifyRadarDemoDbMarker(db, marker);
  }
  return cachedVerification;
}
