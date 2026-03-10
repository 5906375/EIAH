export type DomainSemantic = "core" | "imob";

export type SemanticKey =
  | "runSingular"
  | "runPlural"
  | "blockedPlural"
  | "receipt"
  | "bundle"
  | "commandCenter"
  | "queue"
  | "risk"
  | "processesBlocked";

const dictionary: Record<DomainSemantic, Record<SemanticKey, string>> = {
  core: {
    runSingular: "Run",
    runPlural: "Runs",
    blockedPlural: "Runs bloqueadas",
    receipt: "Receipt",
    bundle: "Bundle",
    commandCenter: "Command Center",
    queue: "Fila",
    risk: "Risco",
    processesBlocked: "Bloqueios",
  },
  imob: {
    runSingular: "Processo",
    runPlural: "Processos",
    blockedPlural: "Processos bloqueados",
    receipt: "Comprovante",
    bundle: "Dossie",
    commandCenter: "Central Operacional",
    queue: "Fila de casos",
    risk: "Risco operacional",
    processesBlocked: "Processos bloqueados",
  },
};

export function getDomainTerm(domain: DomainSemantic, key: SemanticKey) {
  return dictionary[domain][key];
}
