# Liberação de verticais pela EIAH — operação (ADR-011, PR 2b)

## O que muda

Nenhuma vertical ou produto é ativado sem liberação **aprovada** pela EIAH para aquele tenant + workspace + vertical.
A barreira fica no serviço único de ativação (`activateProductInstallation`), então vale para o Marketplace, o chat do
front door e, quando existir, o WhatsApp.

Fluxo:

1. O cliente (Founder ou quem tem `products.activate`) pede a liberação: Marketplace → IMOB → **Solicitar liberação**
   (`POST /api/vertical-access/request`).
2. O agente verificador calcula o score por regras fixas e versionadas (`vertical-access-score.v1`). Ele só lê e nunca
   aprova. O pedido fica `aguardando_humano`.
3. Um administrador da plataforma EIAH decide pela fila (`GET /api/admin/vertical-approvals`,
   `POST /api/admin/vertical-approvals/:id/decision`). A observação é obrigatória ao recusar e ao aprovar contra a
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
`migration`, decisor `system:migration` e sem score, válida só para aquele workspace. Quem consta como
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

## Fora deste PR (ADR-011 §3)

- Pedido e decisão pela conversa, avisos e revogação nos três modos: PR 2c.
- Tela `/app/admin/aprovacoes`: PR 2b-2. Até lá, a fila está disponível pela API.
- Criação de acessos pelo front door: PR 2d. WhatsApp: PR 2e.

## Rollback

`git revert` do merge. As tabelas `vertical_access_approvals` e `vertical_access_approval_events` ficam sem uso e não
afetam nada. Sem a barreira, a ativação volta a depender só de `products.activate`.
