import { buildImobCaseContextV1 } from "./imobCaseContextBuilder";
import { planImobCase } from "./imobCrmCasePlanner";
import {
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { linkImobPropertyOwner } from "./operations/propertyLinkOwner";

function buildNextStep(casePlan: ReturnType<typeof planImobCase>) {
  const primaryAction = casePlan.primaryAction;
  if (!primaryAction || primaryAction.operation === "case.review") {
    return "Consultar caso";
  }
  return primaryAction.label;
}

function buildThreadState(params: ImobOperationalResolverParams, helpers: ResolverHelpers) {
  const current = helpers.asObject(params.threadState);
  return {
    ...(current ?? helpers.createEmptyThreadState()),
    operational: null,
  };
}

export async function resolveImobPropertyLinkOwnerUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  if (!context.asksLinkOwner) return null;

  if (!params.caseId) {
    return {
      mode: "consult",
      action: "crm.property.link_owner",
      threadLabel: "Vínculo",
      conversationState: buildThreadState(params, helpers),
      presentation: {
        text: "Não consegui concluir o vínculo porque este fluxo não está preso a um caso ativo.",
        owner: "Corretor" as const,
        nextStep: "Consultar caso",
        dedupeKey: "crm.property.link_owner:case_scope_missing",
        card: {
          title: "Vínculo indisponível",
          lines: [
            "Use `consultar caso` ou retome o caso ativo antes de concluir o vínculo proprietário-imóvel.",
          ],
        },
      },
    };
  }

  const scopedCase = await params.prisma.imobCase.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, document: true, status: true } },
      property: {
        select: {
          id: true,
          ownerId: true,
          propertyType: true,
          goal: true,
          city: true,
          neighborhood: true,
          address: true,
          status: true,
          pendingItems: true,
          owner: { select: { id: true, name: true } },
        },
      },
      lead: { select: { id: true, name: true, phone: true, email: true } },
      _count: { select: { events: true } },
    },
  });

  const linkResult = await linkImobPropertyOwner({
    input: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      caseId: params.caseId,
      ownerId: scopedCase?.ownerId ?? null,
      propertyId: scopedCase?.propertyId ?? null,
    },
    repository: {
      getOwner: ({ tenantId, workspaceId, ownerId }) =>
        params.prisma.imobOwner.findFirst({ where: { id: ownerId, tenantId, workspaceId } }),
      getProperty: ({ tenantId, workspaceId, propertyId }) =>
        params.prisma.imobProperty.findFirst({
          where: { id: propertyId, tenantId, workspaceId },
          select: { id: true, ownerId: true },
        }),
      linkOwnerToProperty: async ({ propertyId, ownerId }) => {
        await params.prisma.imobProperty.update({
          where: { id: propertyId },
          data: { ownerId },
        });
      },
    },
  });

  if (!linkResult.ok) {
    return {
      mode: "consult",
      action: "crm.property.link_owner",
      threadLabel: "Vínculo",
      conversationState: buildThreadState(params, helpers),
      presentation: {
        text: linkResult.message,
        owner: "Corretor" as const,
        nextStep: "Consultar caso",
        dedupeKey: `crm.property.link_owner:${linkResult.reasonCode}`,
        card: {
          title: "Vínculo bloqueado",
          lines: [linkResult.message],
        },
      },
    };
  }

  const refreshedCase = await params.prisma.imobCase.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, document: true, status: true } },
      property: {
        select: {
          id: true,
          ownerId: true,
          propertyType: true,
          goal: true,
          city: true,
          neighborhood: true,
          address: true,
          status: true,
          pendingItems: true,
          owner: { select: { id: true, name: true } },
        },
      },
      lead: { select: { id: true, name: true, phone: true, email: true } },
      _count: { select: { events: true } },
    },
  });

  if (scopedCase?.propertyId && linkResult.status === "linked") {
    await helpers.recordImobCrmAuditEvent({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      agentId: helpers.auditAgentId,
      subjectType: "property",
      subjectId: scopedCase.propertyId,
      action: "owner_linked",
      summary: "Owner/property link completed from chat",
      before: {
        propertyId: scopedCase.propertyId,
        ownerId: scopedCase.property?.ownerId ?? null,
      },
      after: {
        propertyId: linkResult.propertyId,
        ownerId: linkResult.ownerId,
      },
      metadata: { source: "imob-chat", caseId: linkResult.caseId },
    });
  }

  const caseContext = refreshedCase ? helpers.buildCaseContextFromRecord(refreshedCase) : null;
  const enrichedCaseContext = refreshedCase
    ? buildImobCaseContextV1({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        caseId: params.caseId,
        message: params.message,
        caseContext,
        operational: null,
      })
    : null;
  const casePlan = enrichedCaseContext ? planImobCase(enrichedCaseContext) : null;
  const nextStep = casePlan ? buildNextStep(casePlan) : "Consultar caso";
  const propertyLabel = refreshedCase?.property ? helpers.formatPropertyLookupLabel(refreshedCase.property as any) : linkResult.propertyId;
  const ownerName = helpers.asString(refreshedCase?.owner?.name) ?? linkResult.ownerId;

  return {
    mode: "consult",
    action: "crm.property.link_owner",
    threadLabel: "Vínculo",
    conversationState: buildThreadState(params, helpers),
    caseContext,
    presentation: {
      text: [
        linkResult.status === "already_linked"
          ? "Este imóvel já estava vinculado ao proprietário do caso."
          : "Vínculo entre proprietário e imóvel concluído com sucesso.",
        `Próximo passo: ${nextStep}.`,
      ].join("\n"),
      owner: "Corretor" as const,
      nextStep,
      dedupeKey: `crm.property.link_owner:${params.caseId}:${linkResult.status}`,
      card: {
        title: "Vínculo proprietário-imóvel",
        lines: [
          `Imóvel: ${propertyLabel}`,
          `Proprietário: ${ownerName}`,
          `Status: ${linkResult.status === "already_linked" ? "vínculo já existente" : "vínculo concluído"}`,
          `Próximo passo: ${nextStep}`,
        ],
        ctas: casePlan?.primaryAction
          ? [
              {
                id: `case-plan-${casePlan.primaryAction.id}`,
                label: casePlan.primaryAction.label,
                kind: "secondary" as const,
                action: "send_suggested_message" as const,
                nextMessage: casePlan.primaryAction.nextMessage,
              },
              {
                id: "link-owner-consult-case",
                label: "Consultar caso",
                kind: "neutral" as const,
                action: "send_suggested_message" as const,
                nextMessage: "consultar caso",
              },
            ].filter((item, index, array) => array.findIndex((candidate) => candidate.label === item.label) === index)
          : [
              {
                id: "link-owner-consult-case",
                label: "Consultar caso",
                kind: "neutral" as const,
                action: "send_suggested_message" as const,
                nextMessage: "consultar caso",
              },
            ],
        actionsLayout: "inline",
      },
    },
  };
}
