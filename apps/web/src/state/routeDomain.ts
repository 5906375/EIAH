/**
 * Domínio-alvo da resolução de contexto da sessão a partir da rota (`RequireAuth`).
 *
 * A URL decide o domínio quando muda de rota. `?domain=core` é o ponto de partida da URL: se a CONVERSA estabeleceu outro domínio
 * por um handoff autorizado pelo servidor (a sessão mudou sem a URL mudar), a nova resolução não rebaixa a sessão ao core.
 * Rotas explícitas de IMOB/Logística e a navegação para outra URL continuam mandando como antes.
 */
export type RouteDomain = "core" | "imob" | "logistica";

export function resolveRouteTargetDomain(params: {
  explicitDomain: string | null;
  pathname: string;
  sessionDomain: RouteDomain | undefined;
  routeChanged: boolean;
}): RouteDomain | undefined {
  const { explicitDomain, pathname, sessionDomain, routeChanged } = params;
  const fromRoute: RouteDomain | undefined = explicitDomain === "logistica" ? "logistica"
    : explicitDomain === "core" ? "core"
    : pathname === "/app/logistica" ? "logistica"
    : explicitDomain === "imob" || pathname.startsWith("/app/imob") ? "imob"
    : undefined;
  if (fromRoute === "core" && !routeChanged && sessionDomain && sessionDomain !== "core") return sessionDomain;
  return fromRoute ?? sessionDomain;
}
