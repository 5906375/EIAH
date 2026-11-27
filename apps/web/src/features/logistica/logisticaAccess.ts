import type { LogisticaContextAccess } from "@eiah/contracts";
import { ApiError, apiGetSessionContext } from "@/lib/api";

/** O servidor é a fonte do acesso: 200 traz a capacidade; 403 traz a mesma capacidade com o motivo da negação. */
export async function fetchLogisticaAccess(): Promise<LogisticaContextAccess | null> {
  try {
    const response = await apiGetSessionContext("logistica");
    return response.ok ? response.data?.capabilities?.logisticaContext ?? null : null;
  } catch (error) {
    const body = error instanceof ApiError ? (error.body as { error?: { capability?: LogisticaContextAccess } } | undefined) : undefined;
    return body?.error?.capability ?? null;
  }
}
