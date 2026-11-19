import assert from "node:assert/strict";
import type supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../../services/workspaceResponsibility";
import { ensureVerticalAccessStore } from "../../services/products/verticalAccessApproval";
import { ensureCommercialAuthorityStore } from "../../services/commercialAuthority";
import { ensureAgentEnablementStore } from "../../services/agentEnablement";

/**
 * Semeamento compartilhado do cenário P10/P11 (Front Door → caso IMOB → MKT → claimOnly), extraído SEM alteração de lógica de
 * marketplace.installations.activate.test.ts para que o mesmo cenário seja usado por testes que precisam da guarda de banco descartável.
 * Escreve no DATABASE_URL corrente; a decisão de exigir infraestrutura descartável é de cada teste (assertDisposableDatabase).
 */
export function imobClaimFixtureNames(sx: string) {
  const ids = { t: `tenant-p10-${sx}`, p: `tenant-p10-pub-${sx}`, w: `workspace-p10-${sx}`, w2: `workspace-p10-2-${sx}`, t2: `tenant-p10-2-${sx}`, w3: `workspace-p10-3-${sx}` };
  const users = { founder: `user-p10-founder-${sx}`, a: `user-p10-a-${sx}`, b: `user-p10-b-${sx}`, c: `user-p10-c-${sx}` };
  const tokens = { founder: `tok-p10-founder-${sx}`, a: `tok-p10-a-${sx}`, b: `tok-p10-b-${sx}`, c: `tok-p10-c-${sx}` };
  return { ids, users, tokens };
}
export type ImobClaimFixtureNames = ReturnType<typeof imobClaimFixtureNames>;

export async function seedImobClaimFixture(request: ReturnType<typeof supertest>, sx: string, names: ImobClaimFixtureNames = imobClaimFixtureNames(sx)) {
  const { ids, users, tokens } = names;
  let caseId = "";
  let caseBId = "";
  let caseOtherWorkspaceId = "";
  let caseOtherTenantId = "";
  let mktItemId = "";
  await prismaGlobal.tenant.createMany({ data: [ids.t, ids.p, ids.t2].map((id) => ({ id, name: id })) });
  await prismaGlobal.workspace.createMany({ data: [{ id: ids.w, tenantId: ids.t, name: ids.w }, { id: ids.w2, tenantId: ids.t, name: ids.w2 }, { id: ids.w3, tenantId: ids.t2, name: ids.w3 }] });
  await prismaGlobal.user.createMany({ data: Object.entries(users).map(([name, id]) => ({ id, tenantId: ids.t, email: `${name}-${sx}@example.com`, displayName: `P10 ${name}` })) });
  await prismaGlobal.apiToken.createMany({ data: Object.entries(users).map(([name, id]) => ({ token: tokens[name as keyof typeof tokens], tenantId: ids.t, workspaceId: ids.w, userId: id, description: `p10-${name}`, revoked: false })) });
  await ensureWorkspaceMembershipForUser({ tenantId: ids.t, workspaceId: ids.w, userId: users.founder, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId: ids.t, workspaceId: ids.w, userId: users.a, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId: ids.t, workspaceId: ids.w, userId: users.b, roleKey: "gestor" });
  // C: pode usar o IMOB, mas opera SOMENTE a etapa "proposal" (os casos do teste estão na etapa "listing")
  await ensureWorkspaceMembershipForUser({ tenantId: ids.t, workspaceId: ids.w, userId: users.c, roleKey: "corretor" });
  await prismaGlobal.$executeRawUnsafe(
    `UPDATE eiah_workspace_memberships SET permissions = '["imob.chat.use","imob.stage.proposal"]'::jsonb WHERE user_id = $1 AND tenant_id = $2`, users.c, ids.t);
  await ensureVerticalAccessStore(prismaGlobal);
  await prismaGlobal.$executeRaw`
    INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at)
    VALUES (${`approval-${sx}`}, ${ids.t}, ${ids.w}, 'IMOB', 'aprovado', 'request', 'admin:test@example.com', NOW())`;
  const activation = await request.post("/api/marketplace/installations/activate").set("Authorization", `Bearer ${tokens.founder}`).send({ product: "IMOB" });
  assert.equal(activation.status, 200);
  const mkt = await prismaGlobal.marketplaceItem.create({ data: { type: "agent", name: "MKT", version: "1", isPublic: true, publisherId: ids.p, trustScore: 80 } });
  mktItemId = mkt.id;
  await ensureCommercialAuthorityStore(prismaGlobal);
  await ensureAgentEnablementStore(prismaGlobal);
  // B é titular por FIXTURE sintética (não é o bootstrap real); A não tem designação alguma
  await prismaGlobal.$executeRawUnsafe(
    `INSERT INTO eiah_commercial_authority_designations
       (id, tenant_id, workspace_id, beneficiary_user_id, scope, authority_role, limits, granted_by_user_id, evidence_ref, valid_until)
     VALUES ($1, $2, $3, $4, 'marketplace.subscribe', 'holder', $5::jsonb, 'synthetic-fixture', 'SYNTHETIC-FIXTURE-P10', NOW() + interval '7 days')`,
    `cad_p10_holder_${sx}`, ids.t, ids.w, users.b, JSON.stringify({ allowedScopes: ["read", "execute"], maxValidityDays: 30 }),
  );
  const owner = await prismaGlobal.imobOwner.create({ data: { tenantId: ids.t, workspaceId: ids.w, name: "Marta (sintética)", personType: "person", status: "active", email: "marta@teste-local.invalid" } });
  const property = await prismaGlobal.imobProperty.create({ data: { tenantId: ids.t, workspaceId: ids.w, ownerId: owner.id, propertyType: "apartamento", goal: "venda", address: "Rua das Acácias, 120 (sintético)", city: "Curitiba", neighborhood: "Batel", bedrooms: 3, bathrooms: 2, areaM2: 98, garageSpots: 2, askingPriceCents: 85000000, description: "sintético", status: "active" } });
  const created = await prismaGlobal.imobCase.create({ data: { tenantId: ids.t, workspaceId: ids.w, flow: "listing.activate", stage: "listing", status: "running", ownerResponsible: "Ana (A)", nextStep: "ativar anúncio do imóvel", ownerId: owner.id, propertyId: property.id, blockers: [], pendingItems: [] } });
  caseId = created.id;
  await prismaGlobal.imobCase.update({ where: { id: created.id }, data: { nextStep: "ativar anúncio do apartamento do Batel" } });
  const propertyB = await prismaGlobal.imobProperty.create({ data: { tenantId: ids.t, workspaceId: ids.w, ownerId: owner.id, propertyType: "casa", goal: "venda", address: "Rua XV de Novembro, 45 (sintético)", city: "Curitiba", neighborhood: "Centro", bedrooms: 3, bathrooms: 2, areaM2: 90, garageSpots: 1, askingPriceCents: 70000000, description: "imóvel no Centro (sintético)", status: "active" } });
  // o caso B é o MAIS RECENTE do workspace: qualquer fallback "caso mais recente" o escolheria
  const createdB = await prismaGlobal.imobCase.create({ data: { tenantId: ids.t, workspaceId: ids.w, flow: "listing.activate", stage: "listing", status: "running", ownerResponsible: "Ana (A)", nextStep: "ativar anúncio do imóvel do Centro", ownerId: owner.id, propertyId: propertyB.id, blockers: [], pendingItems: [], updatedAt: new Date(Date.now() + 120_000) } });
  caseBId = createdB.id;
  for (const [key, tenantId, workspaceId, label] of [["ws", ids.t, ids.w2, "Ecoville"], ["tenant", ids.t2, ids.w3, "Agua Verde"]] as const) {
    const o = await prismaGlobal.imobOwner.create({ data: { tenantId, workspaceId, name: "Outra (sintética)", personType: "person", status: "active", email: "outra@teste-local.invalid" } });
    const pr = await prismaGlobal.imobProperty.create({ data: { tenantId, workspaceId, ownerId: o.id, propertyType: "cobertura", goal: "venda", address: "Endereço sintético 9", city: "Curitiba", neighborhood: label, bedrooms: 4, bathrooms: 3, areaM2: 200, garageSpots: 3, askingPriceCents: 150000000, description: `SEGREDO-${key}`, status: "active" } });
    const c = await prismaGlobal.imobCase.create({ data: { tenantId, workspaceId, flow: "listing.activate", stage: "listing", status: "running", ownerResponsible: "Outra", nextStep: `SEGREDO-${key}-proximo-passo`, ownerId: o.id, propertyId: pr.id, blockers: [], pendingItems: [] } });
    if (key === "ws") caseOtherWorkspaceId = c.id; else caseOtherTenantId = c.id;
  }
  return { caseId, caseBId, caseOtherWorkspaceId, caseOtherTenantId, mktItemId };
}

export async function cleanupImobClaimFixture(ids: ImobClaimFixtureNames["ids"]) {
  await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_agent_commercial_enablements WHERE tenant_id = $1", ids.t).catch(() => undefined);
  await prismaGlobal.$executeRawUnsafe("DELETE FROM eiah_commercial_authority_designations WHERE tenant_id = $1", ids.t).catch(() => undefined);
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId: ids.t } }).catch(() => undefined);
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId: { in: [ids.t, ids.t2] } } }).catch(() => undefined);
  await prismaGlobal.imobProperty.deleteMany({ where: { tenantId: { in: [ids.t, ids.t2] } } }).catch(() => undefined);
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId: { in: [ids.t, ids.t2] } } }).catch(() => undefined);
  await prismaGlobal.marketplaceItem.deleteMany({ where: { publisherId: ids.p } }).catch(() => undefined);
  await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId: ids.t } }).catch(() => undefined);
}
