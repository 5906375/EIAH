-- ADR-011 §2.5: revogação em três modos (somente_leitura, bloqueio_total, sem_nova_ativacao).
-- O modo fica em vertical_access_approvals.revocation_mode (coluna já existente); aqui o evento de
-- auditoria passa a guardar o modo de cada revogação, troca de modo ou restauração. Nada é apagado.
ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "revocation_mode" TEXT;
