import type { TransversalTurn } from "../imobTransversalTurn";
import { IMOB_CASE_BINDING_POLICY, type ImobCaseContextMissingResolution } from "./imobCrmAgentContract";
import { buildTransversalTurnText } from "../imobTransversalTurnCopy";
import {
  asPendingItems,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
  scopedImobCases,
} from "./imobCrmOperationalResolverShared";

export function buildImobCaseContextMissingResolution(action: string): ImobCaseContextMissingResolution {
  return {
    mode: "blocked",
    action,
    caseContext: null,
    presentation: {
      text: "Escolha explicitamente o caso IMOB antes de continuar esta operação.",
      suggestedNextAction: "Abra o caso desejado e retome a operação com sua referência.",
      metadata: { reasonCode: IMOB_CASE_BINDING_POLICY.missingReasonCode },
    },
  };
}

/** Authenticated route preflight, before hydration or directed dispatch.
 * Uses the existing business/registration classifiers and case lookup vocabulary.
 */
export function resolveMissingImobCaseBinding(
  input: { caseId?: string | null; actionId?: string | null; message: string },
  helpers: Pick<ResolverHelpers, "normalizeImobRouteText" | "resolveImobBusinessReadIntent"
    | "isBulkPropertyOnboardingQuestion" | "isImobRecentRegistrationReadRequest">,
): ImobCaseContextMissingResolution | null {
  if (input.caseId?.trim()) return null;
  if (input.actionId) return buildImobCaseContextMissingResolution("crm.action.blocked");
  const normalized = helpers.normalizeImobRouteText(input.message);
  if (helpers.isBulkPropertyOnboardingQuestion(normalized)) return null;
  if (helpers.isImobRecentRegistrationReadRequest(normalized)) {
    return buildImobCaseContextMissingResolution("crm.case.recent_registration");
  }
  const intent = helpers.resolveImobBusinessReadIntent(input.message);
  if (intent) return buildImobCaseContextMissingResolution(`crm.case.${intent}`);
  const asksLeadCases = normalized.includes("casos do lead");
  const asksCase = normalized.includes("caso");
  const asksRead = ["mostrar", "ver", "consultar", "quais", "abrir", "status", "o que falta",
    "pendencia", "pendência", "nesse caso", "desse caso", "deste caso", "caso recente", "caso mais recente", "ultimo caso", "último caso"]
    .some((term) => normalized.includes(term));
  return !asksLeadCases && asksCase && asksRead
    ? buildImobCaseContextMissingResolution("crm.case.lookup") : null;
}

function buildChatSafeCaseLookupText(params: {
  flow: string | null | undefined;
  pendingItems: string[];
  nextStep?: string | null;
  blocker?: string | null;
}, helpers: ResolverHelpers) {
  const summary = `Caso ${helpers.formatImobCaseFlowLabel(params.flow ?? "case.review")} localizado.`;
  const hints = [
    params.pendingItems.length > 0 ? "Há pendências operacionais em aberto." : null,
    params.blocker ? "Existe um bloqueio ativo neste atendimento." : null,
    params.nextStep ? "Posso detalhar a próxima ação recomendada para este caso." : null,
  ].filter(Boolean);
  return [summary, ...hints].join("\n");
}

async function readSpecialistAvailabilitySafely(helpers: ResolverHelpers, params: ImobOperationalResolverParams) {
  if (typeof helpers.readBackingSpecialistAvailability !== "function") return undefined;
  try {
    return await helpers.readBackingSpecialistAvailability({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    });
  } catch {
    return undefined;
  }
}

/**
 * Resposta a um turno transversal: o texto descreve só o que a descoberta apurou (ver `imobTransversalTurnCopy`) e a
 * apresentação fica focada no cartão do especialista, sem repetir a leitura comercial do caso.
 */
function applyTransversalTurnPresentation(
  presentation: Record<string, unknown>,
  turn: TransversalTurn,
  transversalCapabilities: unknown[] | null | undefined,
) {
  const first = Array.isArray(transversalCapabilities) ? (transversalCapabilities[0] as Parameters<typeof buildTransversalTurnText>[1]) : null;
  const { card: _card, blocks: _blocks, ...rest } = presentation;
  return { ...rest, text: buildTransversalTurnText(turn, first), blocks: [], suggestedNextAction: undefined };
}

async function readTransversalCapabilitiesSafely(helpers: ResolverHelpers, params: ImobOperationalResolverParams, caseContext: unknown) {
  if (typeof helpers.readTransversalCapabilities !== "function") return undefined;
  try {
    return await helpers.readTransversalCapabilities({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      turnNeeds: params.transversalTurn?.needs ?? null,
      caseContext,
      operational: (params.threadState as { operational?: unknown } | null | undefined)?.operational ?? null,
    });
  } catch {
    return undefined;
  }
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
    if (!params.caseId?.trim()) return buildImobCaseContextMissingResolution("crm.case.recent_registration");
    return helpers.buildImobRecentRegistrationConsult({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      caseId: params.caseId,
      threadState: params.threadState,
      canOperateStage: params.canOperateStage,
    });
  }
  if (context.businessReadIntent) {
    if (!params.caseId?.trim()) return buildImobCaseContextMissingResolution(`crm.case.${context.businessReadIntent}`);
    const item = await scopedImobCases(params.prisma, params.canOperateStage).findFirst({
          where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
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

    // Deduplicação cross-turn: blocked_run_resolution idêntico ao turno anterior → delta curto.
    const dedupeKey = `crm.case.${context.businessReadIntent}:${item.id}`;
    const lastDedupeKey = helpers.asString(helpers.asObject(params.threadState)?.lastCrmReadDedupeKey);
    const updatedState = { ...(params.threadState ?? helpers.createEmptyThreadState()), lastCrmReadDedupeKey: dedupeKey };
    if (context.businessReadIntent === "blocked_run_resolution" && lastDedupeKey === dedupeKey) {
      const pendingItems = asPendingItems(item.pendingItems);
      const primaryPending = pendingItems[0] ?? null;
      const nextStepRaw = helpers.asString(item.nextStep) ?? "consultar caso";
      return {
        mode: "consult",
        action: `crm.case.${context.businessReadIntent}`,
        threadLabel: helpers.formatImobCaseFlowLabel(item.flow),
        conversationState: updatedState,
        caseContext,
        presentation: {
          text: primaryPending
            ? `Quadro não mudou. Pendência principal ainda: ${primaryPending}. Próximo passo: ${nextStepRaw}.`
            : "Quadro não mudou. Nenhuma pendência crítica registrada no momento.",
          nextStep: nextStepRaw,
          dedupeKey,
          card: {
            title: "Sem mudança",
            lines: [primaryPending ? `Pendência: ${primaryPending}` : "Nenhuma pendência crítica.", `Próximo passo: ${nextStepRaw}`],
          },
        },
      };
    }

    // Só chega aqui quando a apresentação será montada (o ramo de dedupe acima não consulta a disponibilidade).
    const specialistAvailability = await readSpecialistAvailabilitySafely(helpers, params);
    const transversalCapabilities = await readTransversalCapabilitiesSafely(helpers, params, caseContext);
    const presentation = helpers.buildImobBusinessReadPresentation({
      intent: context.businessReadIntent,
      caseContext,
      caseSelectionNote: null,
      specialistAvailability,
      transversalCapabilities,
    });
    return {
      mode: "consult",
      action: params.transversalTurn ? `crm.case.transversal.${params.transversalTurn.operation}` : `crm.case.${context.businessReadIntent}`,
      threadLabel: helpers.formatImobCaseFlowLabel(item.flow),
      conversationState: updatedState,
      caseContext,
      presentation: params.transversalTurn
        ? applyTransversalTurnPresentation(presentation as Record<string, unknown>, params.transversalTurn, transversalCapabilities)
        : presentation,
    };
  }
  if (!(!context.asksLeadCases && context.wantsCase && (context.asksCurrentCase || context.asksCaseStatus || context.asksMissing || context.asksShow))) {
    return null;
  }

  const scopedCaseId = params.caseId;
  if (!scopedCaseId?.trim()) return buildImobCaseContextMissingResolution("crm.case.lookup");

  const item = await scopedImobCases(params.prisma, params.canOperateStage).findFirst({
        where: { id: scopedCaseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
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
      text: buildChatSafeCaseLookupText({
        flow: item.flow,
        pendingItems: asPendingItems(item.pendingItems),
        nextStep: item.nextStep,
        blocker,
      }, helpers),
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
