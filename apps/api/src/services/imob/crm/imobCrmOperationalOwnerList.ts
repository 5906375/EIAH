import {
  asPendingItems,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
  mapOwnerPendingLabels,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobOwnerList(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!context.asksOwnerList) return null;

  const allOwners = await params.prisma.imobOwner.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { properties: true, cases: true } } },
  });
  const owners = allOwners.filter((item) => !context.asksPendingOnly || asPendingItems(item.pendingItems).length > 0).slice(0, 8);
  return {
    mode: "consult",
    action: "crm.owner.list",
    threadLabel: "Proprietário",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: [
        owners.length > 0 ? `Encontrei ${owners.length} proprietário(s) no CRM operacional do IMOB.` : context.asksPendingOnly ? "Não encontrei proprietários com pendências no CRM operacional do IMOB." : "Não encontrei proprietários cadastrados no CRM operacional do IMOB.",
        owners.length > 0 ? `Resumo atual: ${owners.map((item) => `${item.name} (${helpers.formatImobStatusLabel(item.status)})`).join(" | ")}.` : null,
        owners.length > 0 ? "Próximo passo: abrir um proprietário para revisar pendências ou vincular um novo imóvel." : null,
      ].filter(Boolean).join("\n"),
      owner: "Corretor" as const,
      nextStep: owners.length > 0 ? "Abrir um proprietário para revisar pendências ou vincular um novo imóvel." : "Cadastrar o primeiro proprietário para iniciar a operação.",
      dedupeKey: context.asksPendingOnly ? "crm.owner.list:pending" : "crm.owner.list",
      card: {
        title: context.asksPendingOnly ? "Proprietários com pendências" : "Proprietários cadastrados",
        lines: owners.length > 0 ? owners.map((item) => `${item.name} | ${helpers.formatImobStatusLabel(item.status)} | Pendências: ${helpers.formatImobPendingList(mapOwnerPendingLabels(item.pendingItems))} | Imóveis: ${item._count?.properties ?? 0}`) : [context.asksPendingOnly ? "Nenhum proprietário com pendências no momento." : "Nenhum proprietário cadastrado até o momento."],
        ctas: owners.slice(0, 3).map((item) => ({
          id: `owner-open-${item.id}`,
          label: `Consultar ${item.name}`,
          kind: "secondary" as const,
          action: "send_suggested_message" as const,
          nextMessage: `consultar proprietário ${item.name}`,
        })),
      },
    },
  };
}
