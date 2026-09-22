/* eslint-disable no-console */
// Radar Social — preparação SINTÉTICA para a demonstração interna. Roda
// SOMENTE contra o Postgres descartável apontado por DATABASE_URL — nunca
// contra eiah-postgres/Neon/produção (nenhuma verificação de "qual banco é
// este" acontece aqui: quem decide isso é quem exporta DATABASE_URL antes de
// rodar o script, exatamente como toda outra ferramenta do repositório).
//
// Uso:
//   DATABASE_URL=postgresql://... node --import tsx apps/api/scripts/seedRadarSocialDemo.ts
//
// Gera (se RADAR_DEMO_DB_MARKER não for informado no ambiente) um marcador
// aleatório novo e grava em `_radar_demo_marker` — o MESMO valor deve ser
// exportado como RADAR_DEMO_DB_MARKER para o processo da API (ver
// apps/api/src/routes/radarSocialDemoGate.ts). Reaproveita os serviços já
// testados do Radar Social (createRadarKnownEntity concede os 4 grants ao
// criador automaticamente) — não reimplementa nenhuma regra de negócio.
import { randomUUID, randomBytes } from "node:crypto";
import { prismaGlobal as prisma } from "@repo/db";
import { createRadarKnownEntity } from "../src/services/radarSocial/radarKnownEntityService";
import { RADAR_SOCIAL_READ_SCOPE, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE } from "../src/services/radarSocial/radarKnownEntityService";
import { RADAR_SOCIAL_MATERIAL_WRITE_SCOPE } from "../src/services/radarSocial/radarMaterialService";
import { RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE } from "../src/services/radarSocial/radarAnalysisRequestService";
import { RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE } from "../src/services/radarSocial/radarAnalysisAttemptService";
import { RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE } from "../src/services/radarSocial/radarRecommendationEvaluationService";
import { RADAR_DEMO_AGENT_KEY, RADAR_DEMO_AGENT_VERSION } from "../src/routes/radarSocial";

const DEMO_SCOPES = [
  RADAR_SOCIAL_READ_SCOPE,
  RADAR_SOCIAL_ENTITY_MANAGE_SCOPE,
  RADAR_SOCIAL_MATERIAL_WRITE_SCOPE,
  RADAR_SOCIAL_ANALYSIS_REQUEST_SCOPE,
  RADAR_SOCIAL_ANALYSIS_EXECUTE_SCOPE,
  RADAR_SOCIAL_RECOMMENDATION_EVALUATE_SCOPE,
];

async function main() {
  const marker = process.env.RADAR_DEMO_DB_MARKER?.trim() || randomBytes(16).toString("hex");

  // Marcador de vínculo — tabela própria, fora de qualquer migration
  // versionada do schema principal (ver radarDemoDbMarker.ts).
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _radar_demo_marker (token TEXT PRIMARY KEY)`);
  await prisma.$executeRawUnsafe(`INSERT INTO _radar_demo_marker (token) VALUES ($1) ON CONFLICT DO NOTHING`, marker);

  const tenant = await prisma.tenant.create({ data: { id: `demo-tenant-${randomUUID()}`, name: "Radar Social — Demonstração Interna" } });
  const workspace = await prisma.workspace.create({ data: { id: `demo-workspace-${randomUUID()}`, tenantId: tenant.id, name: "Workspace de demonstração" } });
  const user = await prisma.user.create({
    data: { id: `demo-user-${randomUUID()}`, tenantId: tenant.id, email: `radar-demo-${randomUUID()}@example.invalid`, displayName: "Usuário sintético — Radar Social" },
  });
  await prisma.tenantMembership.create({
    data: { id: `demo-membership-${randomUUID()}`, tenantId: tenant.id, userId: user.id, role: "workspace_admin", updatedAt: new Date() },
  });

  const token = `radar-demo-${randomBytes(24).toString("hex")}`;
  await prisma.apiToken.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, userId: user.id, token, description: "Radar Social — token sintético de demonstração", revoked: false },
  });

  for (const scope of DEMO_SCOPES) {
    await prisma.tenantActionPolicy.create({
      data: { tenantId: tenant.id, workspaceId: workspace.id, actionName: scope, allowed: true },
    });
  }

  await prisma.agentMetadata.upsert({
    where: { agent: RADAR_DEMO_AGENT_KEY },
    create: { agent: RADAR_DEMO_AGENT_KEY, displayName: "Radar Social — agente sintético de demonstração", version: RADAR_DEMO_AGENT_VERSION, category: "radar-social-demo" },
    update: { version: RADAR_DEMO_AGENT_VERSION },
  });
  await prisma.workspaceAgentAssignment.create({
    data: {
      tenantId: tenant.id, workspaceId: workspace.id,
      agentKey: RADAR_DEMO_AGENT_KEY, agentVersion: RADAR_DEMO_AGENT_VERSION,
      enabled: true, signedByUserId: user.id, signedAt: new Date(),
    },
  });

  const entity = await createRadarKnownEntity(
    {
      tenantId: tenant.id, workspaceId: workspace.id, actorUserId: user.id,
      input: { displayName: "Empresa Fictícia Demo" },
    },
    prisma
  );

  console.log(JSON.stringify({
    tenantId: tenant.id, workspaceId: workspace.id, userId: user.id, token,
    entityId: entity.id, radarDemoDbMarker: marker,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
