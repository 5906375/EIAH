/**
 * Esconde usuário e senha de uma URL de conexão antes de ir para o log
 * (ex.: redis://:senha@host:6379/0 → redis://***@host:6379/0).
 * Se a URL não puder ser lida, não devolve nada dela.
 */
export function redactUrlCredentials(rawUrl: string | null | undefined) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    if (!url.username && !url.password) return url.toString();
    return `${url.protocol}//***@${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "[url inválida]";
  }
}
