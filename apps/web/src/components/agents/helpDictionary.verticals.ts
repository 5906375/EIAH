import { buildDeterministicImobReply } from "@/components/agents/imobContextResolver";
import type { HelpDictionaryEntry } from "@/components/agents/helpDictionary";

const IMOB_GENERIC_QUICK_REPLIES = ["Chat IMOB", "Dashboard IMOB", "Marketplace IMOB"];

export const VERTICAL_HELP_DICTIONARY: HelpDictionaryEntry[] = [
  {
    id: "vertical.imob.workspace_onboarding",
    scope: "vertical",
    verticalId: "imob",
    matcherTerms: [
      "cadastrei cliente novo",
      "workspace novo no imob",
      "como seguir agora no workspace novo",
    ],
    requiresEntitlement: "REAL_ESTATE_CORE",
    resolve: ({ input }) => ({
      intentId: "imob_workspace_onboarding",
      content: buildDeterministicImobReply(input),
      quickReplies: IMOB_GENERIC_QUICK_REPLIES,
    }),
  },
  {
    id: "vertical.imob.navigation",
    scope: "vertical",
    verticalId: "imob",
    matcherTerms: [
      "onde acompanho pipeline e etapas no imob",
      "dashboard imob",
      "chat imob",
      "o que é o imob",
      "como funciona imob do inicio ao fim",
      "quero instalar o imob no workspace",
    ],
    requiresEntitlement: "REAL_ESTATE_CORE",
    resolve: ({ input }) => ({
      intentId: "imob_help",
      content: buildDeterministicImobReply(input),
      quickReplies: IMOB_GENERIC_QUICK_REPLIES,
    }),
  },
];
