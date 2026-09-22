// Radar Social — verificação do vínculo entre o banco efetivamente
// conectado e o Postgres descartável preparado para a demonstração interna.
// Ver docs/architecture/radar-social-construction-plan-v1.md, "Precisões de
// isolamento da demonstração interna — rodada 2", seção B.
//
// Hostname local, nome contendo "test" ou presença de dado sintético NÃO
// comprovam esta condição, isoladamente — por isso o vínculo é um TOKEN
// aleatório, gerado uma única vez por instância descartável e gravado numa
// tabela própria (`_radar_demo_marker`), fora de qualquer migration
// versionada do schema principal. Esta função só LÊ o marcador — nunca o
// cria (isso destruiria a própria prova) — e nunca lança: ausência de
// tabela, ausência de linha ou qualquer outra falha de leitura resolvem
// para `false`, fail-closed.
import { Prisma, type PrismaClient } from "@repo/db";

export const RADAR_DEMO_DB_MARKER_ENV_KEY = "RADAR_DEMO_DB_MARKER" as const;
export const RADAR_DEMO_DB_MARKER_TABLE = "_radar_demo_marker" as const;

export async function verifyRadarDemoDbMarker(
  prisma: PrismaClient,
  expectedToken: string | undefined
): Promise<boolean> {
  if (!expectedToken || expectedToken.trim().length === 0) return false;
  try {
    const rows = await prisma.$queryRaw<Array<{ token: string }>>(
      Prisma.sql`SELECT token FROM _radar_demo_marker WHERE token = ${expectedToken} LIMIT 1`
    );
    return rows.length === 1;
  } catch {
    return false;
  }
}
