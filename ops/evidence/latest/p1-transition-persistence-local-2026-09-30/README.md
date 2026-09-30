# Persistência P1 — validação local em 2026-09-30

Registros originais do harness executado pelo administrador no WSL.

- 01: falha de prontidão durante a inicialização do PostgreSQL.
- 02: migrations aplicadas; typecheck reprovado por tipos Prisma de origens distintas.
- 03: schema válido, 31 migrations aplicadas, typecheck aprovado e 9/9 testes aprovados.

A terceira tentativa registrou exitCode 0 e containerRemoved true.
Os testes usaram PostgreSQL descartável e fixtures sintéticas. sourceVerification permanece not_demonstrated; ADR-009 permanece Proposta.
inputs.sha256 preserva os hashes capturados pelo harness em cada tentativa.
