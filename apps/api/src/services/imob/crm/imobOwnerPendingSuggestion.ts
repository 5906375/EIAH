function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function buildOwnerPendingSuggestion(owner: { name: string; pendingItems?: unknown }) {
  const pendingItems = asStringList(owner.pendingItems);
  if (pendingItems.includes("ownerDocument") || pendingItems.includes("documento do proprietário")) {
    return `Envie assim: documento do proprietário ${owner.name} <cpf ou cnpj>
Ou envie o documento como anexo nesta conversa.`;
  }
  return null;
}
