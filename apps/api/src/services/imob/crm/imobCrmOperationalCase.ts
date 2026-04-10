import {
  asPendingItems,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

function extractCaseIdFromMessage(message: string): string | null {
  if (typeof message !== "string" || message.trim().length === 0) return null;
  const byLabelMatch = message.match(/(?:caso|case|processo)\s*(?:id)?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})/i);
  if (byLabelMatch?.[1]) return byLabelMatch[1];
  return null;
}

export async function resolveImobCaseOperationalConsult(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (helpers.isBulkPropertyOnboardingQuestion(context.normalized)) {
    return helpers.buildBulkPropertyOnboardingConsult({ threadState: params.threadState });
  }
  if (helpers.isImobRecentRegistrationReadRequest(context.normalized)) {
    return helpers.buildImobRecentRegistrationConsult({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      caseId: params.caseId,
      threadState: params.threadState,
    });
  }
  if (context.businessReadIntent) {
    const item = params.caseId
      ? await params.prisma.imobCase.findFirst({
          where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
            lead: { select: { id: true, name: true, phone: true, email: true } },
            _count: { select: { events: true } },
          },
        })
      : await params.prisma.imobCase.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
            lead: { select: { id: true, name: true, phone: true, email: true } },
            _count: { select: { events: true } },
          },
        });
    if (!item) {
      return {
        mode: "consult",
        action: `crm.case.${context.businessReadIntent}`,
        threadLabel: "Caso",
        conversationState: params.threadState ?? helpers.createEmptyThreadState(),
        presentation: {
          text: "Não encontrei um caso IMOB para fazer essa leitura comercial.",
          suggestedNextAction: "Abra ou retome um caso IMOB antes de consultar status, bloqueios ou próxima ação.",
          card: {
            title: "Caso não encontrado",
            lines: ["Vincule esta conversa a um caso ou abra um caso recente no IMOB para consultar pipeline, bloqueios e próximo passo."],
          },
        },
      };
    }
    const caseContext = helpers.buildCaseContextFromRecord(item);
    return {
      mode: "consult",
      action: `crm.case.${context.businessReadIntent}`,
      threadLabel: helpers.formatImobCaseFlowLabel(item.flow),
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      caseContext,
      presentation: helpers.buildImobBusinessReadPresentation({
        intent: context.businessReadIntent,
        caseContext,
        caseSelectionNote: params.caseId ? null : "Usei o caso IMOB mais recente deste workspace para esta leitura.",
      }),
    };
  }
  if (!(!context.asksLeadCases && context.wantsCase && (context.asksCurrentCase || context.asksCaseStatus || context.asksMissing || context.asksShow))) {
    return null;
  }

  const scopedCaseId = params.caseId ?? extractCaseIdFromMessage(params.message);
  if (!scopedCaseId && !context.asksCurrentCase && !context.asksCaseStatus && !context.asksMissing) {
    return {
      mode: "consult",
      action: "crm.case.lookup",
      threadLabel: "Caso",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: "Qual caso você quer consultar?",
        suggestedNextAction: "Digite `consultar caso <código do caso>` para eu abrir no chat.",
        card: {
          title: "Consultar caso",
          lines: ["Informe o código do caso para abrir os detalhes deste atendimento."],
        },
      },
    };
  }

  const item = scopedCaseId
    ? await params.prisma.imobCase.findFirst({
        where: { id: scopedCaseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        include: {
          owner: { select: { id: true, name: true } },
          property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
          lead: { select: { id: true, name: true, phone: true, email: true } },
          _count: { select: { events: true } },
        },
      })
    : await params.prisma.imobCase.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { id: true, name: true } },
          property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
          lead: { select: { id: true, name: true, phone: true, email: true } },
          _count: { select: { events: true } },
        },
      });
  if (!item) {
    return {
      mode: "consult",
      action: "crm.case.lookup",
      threadLabel: "Caso",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: "Não encontrei um caso operacional vinculado a esta conversa.",
        suggestedNextAction: "Cadastre ou retome um caso IMOB antes de consultar pendências e próximos passos.",
        card: {
          title: "Caso não encontrado",
          lines: ["Nenhum caso IMOB recente foi encontrado neste workspace para usar como contexto comercial."],
        },
      },
    };
  }
  const blocker = Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null;
  return {
    mode: "consult",
    action: "crm.case.lookup",
    threadLabel: helpers.formatImobCaseFlowLabel(item.flow),
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    caseContext: helpers.buildCaseContextFromRecord(item),
    presentation: {
      text: [
        scopedCaseId ? `Caso ${helpers.formatImobCaseFlowLabel(item.flow)} localizado.` : `Usei o caso IMOB mais recente para esta leitura: ${helpers.formatImobCaseFlowLabel(item.flow)}.`,
        `Pendências atuais: ${helpers.formatImobPendingList(asPendingItems(item.pendingItems))}`,
        item.nextStep ? `Próximo passo: ${item.nextStep}` : null,
        blocker ? `Bloqueio atual: ${blocker}` : null,
      ].filter(Boolean).join("\n"),
      owner: item.ownerResponsible ?? undefined,
      nextStep: item.nextStep ?? undefined,
      blocker,
      pendingFieldLabels: asPendingItems(item.pendingItems),
      dedupeKey: `crm.case.lookup:${item.id}`,
      card: {
        title: `Caso ${helpers.formatImobCaseFlowLabel(item.flow)}`,
        lines: [
          `Status: ${helpers.formatImobStatusLabel(item.status)}`,
          item.lead?.name ? `Lead: ${item.lead.name}` : null,
          item.property?.city ? `Cidade: ${item.property.city}` : null,
          `Pendências: ${helpers.formatImobPendingList(asPendingItems(item.pendingItems))}`,
          item.nextStep ? `Próximo passo: ${item.nextStep}` : null,
        ].filter(Boolean) as string[],
      },
    },
  };
}
