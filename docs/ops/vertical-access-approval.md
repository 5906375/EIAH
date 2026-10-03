# Liberação de verticais pela EIAH — operação (ADR-011, PRs 2b, 2c-1, 2c-2, 2d e 2f)

## O que muda

Nenhuma vertical ou produto é ativado sem liberação **aprovada** pela EIAH para aquele tenant + workspace + vertical.
A barreira fica no serviço único de ativação (`activateProductInstallation`), então vale para o Marketplace, o chat do
front door e, quando existir, o WhatsApp.

Fluxo:

1. O cliente (Founder ou quem tem `products.activate`) pede a liberação: Marketplace → IMOB → **Solicitar liberação**
   (`POST /api/vertical-access/request`).
2. O agente verificador calcula o score por regras fixas e versionadas (`vertical-access-score.v1`). Ele só lê e nunca
   aprova. O pedido fica `aguardando_humano`.
3. Um administrador da plataforma EIAH decide pela tela **`/app/admin/aprovacoes`**, que usa
   `GET /api/admin/vertical-approvals` e `POST /api/admin/vertical-approvals/:id/decision`.
   A tela tem quatro abas: "Aguardando decisão", "Aprovados na migração", "Revogados" e "Histórico". Cada pedido mostra o score e os
   motivos. Para quem não é administrador, a tela responde "Página não encontrada". A observação é obrigatória ao recusar e ao aprovar contra a
   recomendação do agente.
4. Com a liberação aprovada, o cliente ativa como antes.

O cliente vê só o estado do pedido. A fila mostra só os dados do pedido e os sinais do score.

## Configuração obrigatória

| Variável | Onde | Efeito |
| --- | --- | --- |
| `EIAH_PLATFORM_ADMIN_EMAILS` | API | E-mails dos administradores EIAH, separados por vírgula. **Sem ela, ninguém aprova**, e os tenants novos ficam aguardando. |

A lista não pode ser alterada pela interface. Ser administrador EIAH não depende do papel dentro do tenant.

## Quem já usava antes da barreira

Na primeira leitura de liberação após o deploy, toda instalação ativa sem liberação vira `aprovado` com origem
`migration`, decisor `system:migration` e sem score, válida só para aquele workspace. Quando o administrador abre a
fila, o agente calcula o score dessas liberações (até 50 por leitura) e registra um evento. O estado continua
`aprovado`: nada muda para o cliente sem ação humana. Se a leitura dos sinais falhar, a liberação fica sem score e o
cálculo é tentado de novo na próxima abertura. Quem consta como
`activated_by_user_id` recebe `products.activate` naquele workspace. Isso acontece só quando a liberação é criada: rodar
de novo não devolve uma chave que o Founder tenha tirado. Ninguém perde acesso no deploy.

## Score v1 (`vertical-access-score.v1`)

| Regra | Pontos |
| --- | --- |
| Conta de billing ativa (`tenant_billing_account.status = active`) | 25 |
| Nenhuma disputa aberta (`billing_disputes.status = open`) | 20 |
| Pagamento confirmado nos últimos 90 dias (`payment_intents.status = succeeded`) | 20 |
| Nenhum pagamento falhou nos últimos 30 dias | 10 |
| Nenhuma liberação revogada antes neste tenant | 10 |
| O workspace tem alguém que pode ativar | 15 |

As recomendações são: 80 ou mais, `recomendado`; de 50 a 79, `revisar`; abaixo de 50, `nao_recomendado`.

"Fatura vencida em aberto" aparece como *não avaliado*, porque o sistema ainda não registra fatura paga ou vencida.

Se a leitura dos sinais falhar, o pedido vai ao humano marcado "sem score" e nunca é aprovado automaticamente.

## Revogação (ADR-011 §2.5, PR 2c-1)

O administrador revoga uma liberação `aprovado` pela tela (`POST /api/admin/vertical-approvals/:id/revocation`,
`{ action: "revogar", mode, note }`) e escolhe o modo:

| Modo | Efeito nas rotas `/api/imob/*` | No front door | Nova ativação |
| --- | --- | --- | --- |
| `somente_leitura` (padrão) | só GET/HEAD/OPTIONS; escrita → 403 `IMOB_VERTICAL_READ_ONLY` | só capacidades de consulta | bloqueada |
| `bloqueio_total` | tudo → 403 `IMOB_VERTICAL_REVOKED` | IMOB desligado | bloqueada |
| `sem_nova_ativacao` | uso atual continua | sem mudança | bloqueada |

- A observação é obrigatória ao revogar e ao trocar o modo (`action: "alterar_modo"`). Restaurar
  (`action: "restaurar"`) volta a `aprovado` e não exige observação.
- Nada é apagado: a instalação, os dados e as permissões ficam como estavam.
- O cliente pode pedir de novo. O modo continua valendo enquanto o pedido aguarda e depois de uma recusa; só a
  aprovação o retira.
- No modo somente leitura, conversar com o agente do IMOB também é escrita e fica negado.
- Cada revogação, troca de modo ou restauração gera evento com o modo (`vertical_access_approval_events.revocation_mode`,
  migration `20261002200000_vertical_access_revocation_v1`).
- O cliente vê só o estado e o uso permitido (`usage`: `full`, `read_only` ou `blocked`) em `GET /api/vertical-access`.

## Pela conversa do front door (PR 2c-2)

- **Cliente:** ao pedir para ativar o IMOB sem liberação, quem pode ativar (Founder ou `products.activate`) recebe a
  oferta "Pedir liberação do IMOB". O pedido só sai com essa confirmação logo depois da oferta (um "sim" solto não
  envia). O preview informa `canRequest`; com pedido em análise, a oferta não aparece.
- **Administrador EIAH:** "aprovações pendentes" no `/app/chat` lista até 5 pedidos com score e os pontos não
  atendidos, cada um com os botões **Aprovar** e **Recusar** ao lado, dentro da conversa. O clique já envia; a
  confirmação também é por botão ("Confirmar aprovação/recusa" ou "Cancelar"). O fluxo é: escolher "Aprovar/Recusar pedido N"; escrever a observação quando ela é obrigatória; e
  clicar em "Confirmar aprovação/recusa: …". Nada é decidido antes disso. Para quem não é administrador, a conversa
  responde que não encontrou aprovações.
- **Canal na auditoria:** `vertical_access_approval_events.channel` registra `marketplace`, `tela` ou `chat`.

## Avisos no app (PR 2c-2)

- Cada decisão gera um aviso em `vertical_access_notices` (aprovado, recusado, revogado em cada modo e restaurado).
- O aviso diz só o estado da liberação: nunca score, sinais de billing ou a observação do administrador.
- No `/app/chat` o aviso chega **como mensagem da EIAH dentro da conversa**, uma vez por conversa, para todas as
  pessoas do workspace. O botão "Entendi o aviso de dd/mm, hh:mm" marca como lido só para quem clicou
  (`vertical_access_notice_reads`). O Marketplace do IMOB mostra o mesmo aviso no topo da página.
- API: `GET /api/vertical-access/notices` e `POST /api/vertical-access/notices/:id/read`. Um aviso de outro workspace
  responde 404.
- A fila é independente de canal: o WhatsApp (PR 2e) vai ler a mesma fila.
- Migration: `20261003090000_vertical_access_notices_v1`.

## Criar acesso pelo front door (PR 2d, ADR-011 §2.7)

- Na conversa do `/app/chat`, um pedido como "criar acesso" abre o cartão **Criar acesso** dentro da própria
  conversa. O cartão só funciona para quem gerencia membros (Founder, Gestor, Admin) e só em workspace com pelo menos
  uma vertical **aprovada** pela EIAH; nos outros casos ele explica o motivo. O servidor valida de novo
  (`GET /api/front-door/accesses/options`, `POST /api/front-door/accesses`). O e-mail e o link ficam só na tela do
  cartão: não entram no histórico da conversa.
- O convite de workspace é reaproveitado:
  - O link é de uso único e vale 72 horas.
  - O link aparece **uma única vez**, na criação ou na reemissão. A lista do Perfil não mostra mais o link, só a
    situação e o botão "Reemitir link".
  - Um link novo para o mesmo e-mail invalida o anterior, que passa a `revoked`.
- A pessoa define a própria senha; a EIAH nunca vê nem exibe a senha.
- Quem já tem conta entra pelo login e só é adicionado ao workspace, sem senha nova. A página de acesso já abre em
  "Entrar".
- Só concede `products.activate` quem já tem a permissão (regra do 2a). A função Founder não é concedida por convite.
- O cartão envia o e-mail direto à API, e a resposta traz o e-mail mascarado (`ma***@dominio`). Se alguém escrever um
  e-mail ao pedir um acesso no chat, o histórico guarda o e-mail mascarado.
- A barreira de vertical aprovada vale para o front door. O convite pelo Perfil continua pela regra atual de membros.

## Senha própria no cadastro (ajustes após o teste manual)

- O **Cadastrar** sem convite agora pede senha (mínimo de 8 caracteres). A senha é guardada só como hash
  (`legacy_auth_credentials`), e a pessoa entra de novo com e-mail e senha depois de sair. A API continua aceitando o
  cadastro sem senha, para os clientes antigos.
- Na página de um convite já usado, substituído ou expirado, "Entrar" faz o login normal, sem tentar aceitar o convite de
  novo.

## Conta de billing e primeira mensalidade pela conversa (PR 2f, ADR-011 §2.8)

- Ao pedir "ativar o IMOB" sem liberação, quem pode pedir (Founder ou `products.activate`) e não tem conta de billing
  ativa recebe o aviso e um cartão com os planos atuais (`solo`, `starter`, `growth`, `scale`) e o botão para pedir a
  liberação mesmo assim. A conta **não** é obrigatória.
- **Escolher** → cartão de confirmação → **Confirmar criação da conta** cria `tenant_billing_account` (status `active`,
  BRL). Conta existente não é alterada. Auditoria: `guardrail_audit_ledger.event_type = 'billing.account.created'`.
- Em seguida, **Pagar R$ … (simulado)**: só com o meio `bank` em modo `simulated` (padrão; com
  `SETTLEMENT_PROVIDER_MODE_BANK=full` a conversa recusa, porque não há integração real). Grava um evento de valor zero
  no `billing_ledger` (`type = 'adjustment'`, `model = 'front_door.first_payment.simulated'`), uma vez por tenant, e a
  auditoria `billing.first_payment.simulated`. Nenhuma cobrança real.
- Score: a conta ativa conta pela regra `conta_billing_ativa` (+25; um tenant novo passa de 55 para 80, "Recomendado").
  O pagamento simulado **não** conta como pagamento confirmado.
- Rotas: `GET /api/front-door/billing`, `POST /api/front-door/billing/account` (`{ planCode, confirmed: true }`),
  `POST /api/front-door/billing/first-payment` (`{ confirmed: true }`).

## Fora deste PR (ADR-011 §3)

- WhatsApp (avisos, ativação e envio do link): PR 2e.

## Rollback

`git revert` do merge. As tabelas `vertical_access_approvals` e `vertical_access_approval_events` ficam sem uso e não
afetam nada. Sem a barreira, a ativação volta a depender só de `products.activate`.
