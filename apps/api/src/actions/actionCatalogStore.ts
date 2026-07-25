import { Prisma, prismaGlobal } from "@repo/db";
import type { VersionedActionContract } from "@eiah/core/actions/registry/VersionedActionRegistry";

/**
 * Representação serializada de cada ação de um contrato versionado.
 * O objetivo é armazenar o catálogo de ações em formato estruturado JSON no banco.
 */
type SerializedAction = {
  name: string;
  description?: string;
  version: string;
  guardrails: string[];
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
};

/**
 * Converte um contrato de ação versionada em um objeto serializado pronto para persistência.
 */
function serializeActions(contract: VersionedActionContract): Record<string, SerializedAction> {
  const entries: Record<string, SerializedAction> = {};

  const actions = Object.entries(contract.actions) as Array<
    [string, VersionedActionContract["actions"][string]]
  >;

  for (const [name, action] of actions) {
    entries[name] = {
      name: action.name ?? name,
      description: action.description,
      version: action.version ?? "1.0.0",
      guardrails: (action.guardrails ?? []).map((guard) => guard.name),
      hasInputSchema: Boolean(action.contract?.input),
      hasOutputSchema: Boolean(action.contract?.output),
    };
  }

  return entries;
}

/**
 * Persiste ou atualiza uma versão de contrato de ação.
 *
 * ✅ Correções:
 * - Usa `unique_name_version` como chave composta.
 * - Campo JSON renomeado de `actions` → `schema`.
 * - Mantém compatibilidade com o novo Prisma Client.
 */
export async function persistActionVersion(contract: VersionedActionContract) {
  const contractName = "default";
  const actions = serializeActions(contract);

  await prismaGlobal.actionVersion.upsert({
    where: {
      unique_name_version: {
        name: contractName,
        version: contract.version,
      },
    },
    update: {
      schema: actions as Prisma.JsonObject,
    },
    create: {
      name: contractName,
      version: contract.version,
      schema: actions as Prisma.JsonObject,
    },
  });
}
