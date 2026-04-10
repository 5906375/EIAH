function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function injectResponsibleLabelIntoText(text: string, responsibleLabel: string) {
  void responsibleLabel;
  if (text.trim().length === 0) return text;
  return text
    .split("\n")
    .filter((line) => line.trim().indexOf("Responsável agora:") !== 0)
    .join("\n")
    .trim();
}

export function applyResponsibleLabelToResolvedTurn<T extends { presentation?: Record<string, any> | null }>(
  data: T,
  responsibleLabel: string
): T {
  if (!data.presentation) return data;
  const currentOwner = asString(data.presentation.owner);
  const nextOwner = !currentOwner || currentOwner === "Corretor" ? responsibleLabel : currentOwner;
  return {
    ...data,
    presentation: {
      ...data.presentation,
      owner: nextOwner,
      text: injectResponsibleLabelIntoText(String(data.presentation.text ?? ""), nextOwner),
    },
  };
}
