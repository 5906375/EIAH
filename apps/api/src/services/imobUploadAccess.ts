/**
 * Documentos do IMOB (contratos, matrículas, documentos de proprietário) só
 * podem ser enviados e baixados por quem tem `imob.chat.use` no workspace.
 * Sem usuário (token técnico) NÃO há acesso: não existe contrato verificável de identidade de serviço para o IMOB
 * (AUTHZ-IMOB-SERVICE-001, fail-closed). Também exige o IMOB INSTALADO e HABILITADO no workspace (AUTHZ-IMOB-INSTALLATION-001).
 * Uploads de outros agentes não mudam.
 */
export async function canAccessImobUploads(params: {
  agentSlug: string;
  userId?: string | null;
  hasImobChatPermission: () => Promise<boolean>;
  /** Instalação/habilitação do IMOB no workspace (somente leitura). Quando informada e falsa, nega antes de olhar a permissão. */
  isImobEnabled?: () => Promise<boolean>;
}) {
  if (params.agentSlug !== "imob") return true;
  if (params.isImobEnabled && !(await params.isImobEnabled())) return false;
  if (!params.userId) return false;
  return params.hasImobChatPermission();
}
