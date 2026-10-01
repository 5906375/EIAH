/**
 * Documentos do IMOB (contratos, matrículas, documentos de proprietário) só
 * podem ser enviados e baixados por quem tem `imob.chat.use` no workspace.
 * Sem usuário (token de serviço), segue a regra das rotas do IMOB.
 * Uploads de outros agentes não mudam.
 */
export async function canAccessImobUploads(params: {
  agentSlug: string;
  userId?: string | null;
  hasImobChatPermission: () => Promise<boolean>;
}) {
  if (params.agentSlug !== "imob") return true;
  if (!params.userId) return true;
  return params.hasImobChatPermission();
}
