import { ApiError } from "@/lib/api";

const NETWORK_ERROR_HINT =
  "Não foi possível conectar à API. Verifique se o backend está online e a variável VITE_API_URL.";

function isNetworkErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed")
  );
}

export function resolveErrorMessage(
  error: unknown,
  fallback = "Falha ao processar a requisição."
) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Credenciais inválidas.";
    if (error.status === 403) return "Sem permissão para acessar.";
    return error.message;
  }
  if (error instanceof TypeError) {
    if (isNetworkErrorMessage(error.message)) return NETWORK_ERROR_HINT;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
