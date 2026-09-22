-- AlterTable: adiciona a coluna nullable primeiro (sem default) para permitir
-- backfill controlado, em vez de um default de banco permanente que
-- classificaria silenciosamente qualquer gravação futura (não só as linhas
-- pré-existentes) como "signal-forward-fingerprint.v1".
ALTER TABLE "signal_forward_requests" ADD COLUMN "fingerprint_version" TEXT;

-- Backfill: preenche somente as linhas que já existiam antes desta coluna
-- existir. Evidência de que "signal-forward-fingerprint.v1" é o valor correto
-- para essas linhas: o algoritmo de fingerprint (originContract.ts) foi
-- introduzido uma única vez, no commit 768e1b2, e a constante
-- FINGERPRINT_CONTRACT_VERSION nunca mudou desde então (confirmado via
-- `git log -p --follow` sobre originContract.ts) — não há outra versão que
-- essas linhas poderiam ter usado.
UPDATE "signal_forward_requests"
SET "fingerprint_version" = 'signal-forward-fingerprint.v1'
WHERE "fingerprint_version" IS NULL;

-- Só agora a coluna se torna obrigatória — sem nenhum DEFAULT associado.
-- Qualquer INSERT futuro que omita fingerprint_version falha com violação de
-- NOT NULL, em vez de receber "v1" silenciosamente.
ALTER TABLE "signal_forward_requests" ALTER COLUMN "fingerprint_version" SET NOT NULL;
