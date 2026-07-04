# AGENTS

## Regra Padrão do Chat

O comportamento do chat neste projeto deve seguir arquitetura `agent-driven`.

Regra obrigatória:
1. definir ou ajustar o contrato do agente;
2. implementar a execução dessa regra no `engine`;
3. expor no `ChatAgentLauncher` apenas o resultado já resolvido.

Isso implica:
- nenhuma nova regra de comportamento deve nascer diretamente no `ChatAgentLauncher`;
- toda regra de resposta, handoff, fallback, bloqueio, clarificação e quick reply deve pertencer a um agente específico;
- o `engine` executa o comportamento do agente;
- o `launcher` apenas renderiza.

Anti-padrão a evitar:
- adicionar regra nova no `ChatAgentLauncher` sem antes definir a qual agente ela pertence, em qual contrato vive e como o `engine` deve executá-la.

Objetivo:
- coerência entre agentes;
- menor acoplamento com a UI;
- menos drift entre contrato, comportamento e renderização;
- expansão segura para agentes instalados e futuros.

## Resumo de UX

Na experiência do usuário:
- o `EIAH` funciona como front door da conversa;
- especialistas entram como continuidade natural, sem parecer troca brusca de bot;
- verticais como `IMOB` e `LEGAL` devem atuar como contexto, não como chips soltos;
- quick replies devem ser poucas, úteis e válidas como input;
- `defaultNextStep` não deve virar chip automaticamente;
- o `ChatAgentLauncher` não deve injetar UX genérica por conta própria.

Documentação completa:
- [docs/architecture/agent-chat-runtime.md](./docs/architecture/agent-chat-runtime.md)

Artefatos operacionais:
- [presentation-snapshot-v1.md](/home/jusall/projects/EIAH_BUILDER/docs/architecture/presentation-snapshot-v1.md)

Backlog documental futuro:
- `chat-drift-backlog.md`
- `chat-launcher-audit.md`
- `vertical-context-imob.md`
- `vertical-context-legal.md`
- `chat-rollout-metrics.md`
