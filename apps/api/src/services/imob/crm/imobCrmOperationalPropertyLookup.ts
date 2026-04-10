import {
  asPendingItems,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { findPropertyForPropertyActions } from "./imobCrmOperationalPropertyFinder";

export async function resolveImobPropertyLookup(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!(context.wantsProperty && (context.asksMissing || context.asksShow))) return null;

  const property = await findPropertyForPropertyActions(params, helpers, context);
  if (!property) {
    return {
      mode: "consult",
      action: "crm.property.lookup",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: "Não encontrei esse imóvel no CRM operacional do IMOB.",
        suggestedNextAction: "Use o identificador, endereço ou o caso ativo para localizar o imóvel.",
        card: {
          title: "Imóvel não encontrado",
          lines: ["Use o número do imóvel, endereço ou o caso ativo para consultar a ficha operacional."],
        },
      },
    };
  }

  const propertyCases = await params.prisma.imobCase.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, propertyId: property.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, flow: true, stage: true, status: true, nextStep: true, pendingItems: true, ownerResponsible: true, blockers: true, threadId: true, updatedAt: true },
  });
  const latestCase = propertyCases[0] ?? null;
  return {
    mode: "consult",
    action: "crm.property.lookup",
    threadLabel: "Imóvel",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    caseContext: latestCase ? helpers.buildCaseContextFromRecord(latestCase) : undefined,
    presentation: {
      text: [
        `${helpers.formatPropertyLookupLabel(property)} localizado no CRM operacional.`,
        `Pendências atuais: ${helpers.formatImobPendingList(asPendingItems(property.pendingItems))}.`,
        helpers.buildPropertyPendingSuggestion({ id: property.id, address: property.address, pendingItems: asPendingItems(property.pendingItems) }),
        "Próximo passo: vincular o imóvel ao próximo lead ou etapa comercial/documental.",
      ].filter(Boolean).join("\n"),
      owner: "Corretor" as const,
      nextStep: "Vincular o imóvel ao próximo lead ou etapa comercial/documental.",
      pendingFieldLabels: asPendingItems(property.pendingItems),
      dedupeKey: `crm.property.lookup:${property.id}`,
      card: {
        title: helpers.formatPropertyLookupLabel(property),
        lines: [
          property.propertyType ? `Tipo: ${property.propertyType}` : null,
          property.goal ? `Finalidade: ${property.goal}` : null,
          property.city ? `Cidade: ${property.city}` : null,
          property.neighborhood ? `Bairro: ${property.neighborhood}` : null,
          property.address ? `Endereço: ${property.address}` : null,
          property.owner?.name ? `Proprietário: ${property.owner.name}` : null,
          typeof property.askingPriceCents === "number" ? `Valor: ${helpers.formatBudgetCentsForImob(property.askingPriceCents)}` : null,
          `Status: ${helpers.formatImobStatusLabel(property.status)}`,
          `Pendências: ${helpers.formatImobPendingList(asPendingItems(property.pendingItems))}`,
          `Casos: ${property._count?.cases ?? 0}`,
        ].filter(Boolean) as string[],
        ctas: [
          { id: `property-edit-${property.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar imóvel ${property.id}` },
          { id: `property-delete-${property.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir imóvel ${property.id}` },
          { id: `property-print-${property.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
        ],
        actionsLayout: "inline",
      },
    },
  };
}
