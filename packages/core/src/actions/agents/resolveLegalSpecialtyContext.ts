import type { AgentChatCopy, AgentProfileSeed, LegalSpecialty } from "./types";

export type LegalSpecialtyContext = {
  vertical?: string | null;
  intent?: string | null;
  userText?: string | null;
  specialtyKey?: string | null;
};

export type ResolvedLegalSpecialtyContext = {
  activeSpecialtyKeys: string[];
  activeSpecialties: LegalSpecialty[];
  resolvedChatCopy: AgentChatCopy | null;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function mergeUnique(items: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of items) {
    if (!group) continue;
    for (const item of group) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function specialtyMatchesContext(specialty: LegalSpecialty, context: LegalSpecialtyContext): boolean {
  const vertical = normalize(context.vertical);
  const intent = normalize(context.intent);
  const userText = normalize(context.userText);
  const specialtyKey = normalize(context.specialtyKey);

  if (specialtyKey && specialtyKey === normalize(specialty.key)) {
    return true;
  }

  if (specialty.key === "realEstate") {
    if (vertical === "imob") return true;
    if (intent.includes("imob") || intent.includes("real_estate") || intent.includes("realestate")) return true;
  }

  return (specialty.triggers ?? []).some((trigger) => userText.includes(normalize(trigger)));
}

export function resolveLegalSpecialtyContext(
  profile: AgentProfileSeed,
  context: LegalSpecialtyContext,
): ResolvedLegalSpecialtyContext {
  const base = profile.chatCopy ?? null;
  const specialties = Object.values(profile.legalSpecialties ?? {});
  const activeSpecialties = specialties.filter((specialty) => specialtyMatchesContext(specialty, context));

  if (!base) {
    return {
      activeSpecialtyKeys: activeSpecialties.map((specialty) => specialty.key),
      activeSpecialties,
      resolvedChatCopy: null,
    };
  }

  return {
    activeSpecialtyKeys: activeSpecialties.map((specialty) => specialty.key),
    activeSpecialties,
    resolvedChatCopy: {
      ...base,
      analysisFocus: mergeUnique([base.analysisFocus, ...activeSpecialties.map((specialty) => specialty.analysisFocus)]),
      commonRisks: mergeUnique([base.commonRisks, ...activeSpecialties.map((specialty) => specialty.commonRisks)]),
      missingFieldsGuide: mergeUnique([
        base.missingFieldsGuide,
        ...activeSpecialties.map((specialty) => specialty.missingFieldsGuide),
      ]),
      supportedDocumentTypes: mergeUnique([
        base.supportedDocumentTypes,
        ...activeSpecialties.map((specialty) => specialty.supportedDocumentTypes),
      ]),
      exampleRequests: mergeUnique([base.exampleRequests, ...activeSpecialties.map((specialty) => specialty.exampleRequests)]),
      quickReplies: mergeUnique([base.quickReplies, ...activeSpecialties.map((specialty) => specialty.quickReplies)]),
    },
  };
}
