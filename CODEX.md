# CODEX.md — EIAH Builder

Codex no VS Code/IDE deve seguir as instruções comuns em:

`IA_EIAH.md`

Antes de qualquer alteração, leia também:

- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`

Não duplique regras neste arquivo.

Se houver conflito, prevalecem:

1. `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
2. `AGENTS.md`
3. `docs/architecture/agent-chat-runtime.md`
4. `docs/EVIDENCE_INDEX.md`
5. `IA_EIAH.md`

Regra operacional curta:

```text
Leia IA_EIAH.md antes de implementar.
Não adicione lógica cognitiva no ChatAgentLauncher.
Não atualize Evidence Index sem evidência real.
Sem evidência indexável, classifique como parcial.
```


Observação operacional:
- a resposta final deve seguir o formato do item 15 de `IA_EIAH.md`;
- listar agentes envolvidos;
- incluir resumo das alterações;
- registrar no Evidence Index toda evidência real/indexável gerada pela tarefa.
