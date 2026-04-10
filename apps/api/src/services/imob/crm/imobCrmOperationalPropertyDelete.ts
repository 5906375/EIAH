import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { findPropertyForPropertyActions } from "./imobCrmOperationalPropertyFinder";

function extractArchiveReason(message: string) {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (normalized.includes("vendid")) return "vendido";
  if (normalized.includes("alugad")) return "alugado";
  if (normalized.includes("outro")) return "outro";
  return null;
}

export async function resolveImobPropertyDelete(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext | ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  if ("asksDelete" in context && "wantsProperty" in context) {
    if (!(context.wantsProperty && context.asksDelete)) return null;
    const property = await findPropertyForPropertyActions(params, helpers, context);
    if (!property) {
      return {
        mode: "consult",
        action: "crm.property.delete",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? helpers.createEmptyThreadState(),
        presentation: {
          text: "Não encontrei esse imóvel para confirmar o arquivamento.",
          suggestedNextAction: "Use o identificador, endereço ou o caso ativo para localizar o imóvel correto.",
        },
      };
    }
    return {
      mode: "consult",
      action: "crm.property.delete",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: `Confirme o arquivamento do imóvel ${helpers.formatPropertyLookupLabel(property)}.`,
        dedupeKey: `crm.property.delete.confirm:${property.id}`,
        card: {
          title: `Arquivar imóvel ${helpers.formatPropertyLookupLabel(property)}`,
          lines: ["Essa ação arquiva o cadastro e remove o imóvel das consultas operacionais padrão."],
          ctas: [
            { id: `property-delete-confirm-${property.id}`, label: "Confirmar arquivamento", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar arquivamento do imóvel ${property.id}` },
          ],
        },
      },
    };
  }

  if (!helpers.isPropertyDeleteConfirmationMessage(params.message) || !context.propertyCrudId) return null;
  const property = await params.prisma.imobProperty.findFirst({
    where: { id: context.propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!property) return null;

  const activeCasesCount = await params.prisma.imobCase.count({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, propertyId: property.id },
  });
  if (activeCasesCount > 0) {
    return {
      mode: "consult",
      action: "crm.property.delete",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: `Não posso excluir o imóvel ${helpers.formatPropertyLookupLabel(property)} porque ainda existem casos ativos vinculados a esse cadastro.`,
        blocker: "Excluir ou encerrar os casos ativos antes de arquivar o imóvel.",
        dedupeKey: `crm.property.delete.blocked:${property.id}`,
      },
    };
  }
  const metadata = helpers.asObject(property.metadata) ?? {};
  const archiveReason = extractArchiveReason(params.message);
  await params.prisma.imobProperty.update({
    where: { id: property.id },
    data: {
      status: "archived",
      metadata: {
        ...metadata,
        archivedAt: new Date().toISOString(),
        archivedByUserId: null,
        archivedReason: archiveReason,
        source: "imob-chat",
      },
    },
    include: { owner: { select: { id: true, name: true } } },
  });
  return {
    mode: "consult",
    action: "crm.property.delete",
    threadLabel: "Imóvel",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: `Cadastro do imóvel ${helpers.formatPropertyLookupLabel(property)} arquivado com sucesso.${archiveReason ? ` Motivo: ${archiveReason}.` : ""}`,
      nextStep: "O cadastro não aparecerá mais nas consultas operacionais padrão.",
      dedupeKey: `crm.property.delete:${property.id}`,
    },
  };
}
