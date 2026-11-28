# Paridade do chat IMOB: `/app/chat` × `/app/imob/chat` (ADR-010, etapa E)

Status: informativo. Este documento não autoriza redirect, rollout de produção nem alteração do Evidence Index.

## O que é testado

`scripts/e2e/imobChatParity.ts` (`pnpm test:e2e-imob-chat-parity`) roda as mesmas jornadas nos dois chats, num tenant novo com o IMOB ativado pelo Marketplace, e confere cada resultado na API:

| Passo | `/app/imob/chat` | `/app/chat` |
| --- | --- | --- |
| Abrir "Cadastrar proprietário" | menu Proprietários | pedido "quero cadastrar um proprietário" → handoff governado (`chat.vertical_handoff.v2`) → formulário |
| Salvar proprietário | grava e oferece "Cadastrar imóvel deste proprietário" | idem |
| Salvar imóvel do proprietário | proprietário já escolhido; oferece "Gerar contrato de locação" | idem |
| Salvar locação e abrir contrato | contrato pré-preenchido pelos cadastros | idem |
| Encerrar locação | barra Locações → Encerrar; histórico com 1 locação encerrada | idem |
| Nenhuma run criada | sim | sim |

No `/app/chat` roda também a ativação pela conversa (etapa F), num workspace sem IMOB: o pedido oferece ativar, a proposta não ativa nada, e só a confirmação explícita ativa; em seguida o pedido segue com o IMOB.

Saída: `report.json` (tabela de paridade por passo) e prints em `E2E_ARTIFACT_DIR`.

## Como rodar

- CI: job `ImobChatParityE2EInformative` (`.github/workflows/ci.yml`), com Postgres, Redis, API e web; `continue-on-error`, artefatos em `imob-chat-parity-e2e-informative`.
- Local, com a stack no ar: `E2E_API_URL=http://127.0.0.1:58080/api E2E_WEB_URL=http://127.0.0.1:55173 pnpm test:e2e-imob-chat-parity` (use `E2E_CHROMIUM_PATH` se o Chromium não estiver no cache do Playwright).
- Liberação pela EIAH (ADR-011): cada tenant do teste pede a liberação do IMOB e um administrador EIAH de teste aprova pela API do produto. O e-mail desse administrador (`E2E_ADMIN_EMAIL`, padrão `parity-admin@e2e.local`) precisa estar em `EIAH_PLATFORM_ADMIN_EMAILS` da API; como o onboarding não reaproveita e-mail, use um banco novo ou outro `E2E_ADMIN_EMAIL` a cada execução local.

## Critério para a decisão de redirect

A decisão de redirecionar `/app/imob/chat` para `/app/chat` é do responsável (ADR-010, §4) e só deve ser pedida quando:

1. o job `ImobChatParityE2EInformative` passar de forma recorrente na `main` (sugestão: 10 execuções seguidas);
2. o critério de paridade da ADR-010 §5 estiver atendido (continuidade de thread, RBAC/entitlement, fail-closed, jornadas críticas);
3. o uso real no `/app/chat` (cadastros e contratos de uma carteira real) não tiver regressão reportada.

## Rollout e rollback

- Rollout por workspace: o `/app/chat` só entrega a conversa ao IMOB quando o registry do workspace tem o IMOB `enabled` e o usuário tem `imob.chat.use`; workspaces sem IMOB seguem só com o EIAH.
- Rollback: `git revert` do PR da etapa correspondente (D, F ou C); nenhum dado novo é criado pelo `/app/chat` além dos mesmos cadastros do IMOB. O `/app/imob/chat` continua disponível enquanto não houver decisão de redirect.
