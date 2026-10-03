# ADR-011 — Liberação de verticais pela EIAH (agente + humano) e acesso por link de senha no front door

## Status

Aprovada pelo administrador único (ADR-008) — implementação pendente

## Data

2026-10-02

## Responsável pela decisão

Carlos Alberto Merlo

## Decisão

**Decisão de Carlos Alberto Merlo — 02/10/2026, America/Sao_Paulo.** Origem: declaração explícita do usuário em
conversa, registrada literalmente, consolidando as decisões tomadas na mesma conversa (§2). Registro textual, sem
assinatura digital ou verificação independente de identidade.

> “Eu, Carlos Alberto Merlo, aprovo em 02/10/2026 que o uso de qualquer vertical ou produto na EIAH dependa de liberação
> registrada pela EIAH por tenant, workspace e vertical. A liberação é decidida por um humano administrador da
> plataforma, apoiado por um score de agente calculado por regras fixas e versionadas; o score nunca aprova sozinho.
> Aprovo a barreira de liberação antes da ativação no Marketplace, no chat do front door e, quando disponível, no
> WhatsApp, a migração que preserva quem já usa verticais ativas, os três modos de revogação sem apagar dados e a
> criação de acessos pelo front door por link de uso único, com validade de 72 horas, em que a própria pessoa define
> a senha. Esta decisão complementa a ADR-010 no ponto de billing, não altera preços, cobrança ou o IMOB Cost, não
> altera ruleset nem Evidence Index e não autoriza aprovação automática por score.”

## 1. Contexto

- A ADR-010 unificou o chat e a ativação de verticais em `/app/chat`, e declarou expressamente que **não altera
  billing/custo**. Esta ADR cria uma barreira ligada a billing e por isso exige decisão própria.
- O #473 (merge `6d72a9b`) restringiu a ativação ao Founder e a quem tem a permissão `products.activate`.
- Fatos de código verificados em 2026-10-02 (`main` `6d72a9b`):
  - Não existe a figura de “administrador da plataforma EIAH”; só papéis por tenant
    (`apps/api/src/services/workspaceResponsibility.ts`).
  - Já existem dados de billing legíveis: `TenantBillingAccount`, `TenantInvoice`, `BillingLedger`, `BillingDispute`,
    `PaymentIntent` (`packages/db/prisma/schema.prisma`).
  - As ativações ficam em `TenantProductInstallation` (status, `activatedByUserId`).
  - O convite de workspace já existe, é de uso único (`status = 'accepted'`), tem validade padrão de 14 dias, e a
    própria pessoa define a senha no aceite; o servidor guarda só o hash (`/auth/workspace-invitations/*`).
  - Não há envio de e-mail nem de WhatsApp no código; a API de WhatsApp está em andamento.
  - Brecha: `products.activate` é concedível por qualquer pessoa que gerencia membros, mesmo sem ter a permissão.

## 2. Decisões

### 2.1 Registro de liberação

- Um registro por tenant + workspace + vertical, com estados `pendente`, `em_analise`, `aguardando_humano`,
  `aprovado`, `recusado` e `revogado`.
- Guarda quem decidiu, quando, observação, o score e a recomendação do agente no momento e a versão da regra usada.
- Cada mudança gera um registro de auditoria.

### 2.2 Agente verificador e score

- Somente leitura: nunca aprova, nunca altera billing.
- Score de 0 a 100 por **regras fixas e versionadas** sobre sinais objetivos: conta de billing existente, ausência de
  fatura vencida em aberto, pagamento confirmado, ausência de disputa aberta, ausência de revogação anterior e
  existência de um responsável com `products.activate`.
- Resultado: score, motivos por ponto e recomendação `recomendado` | `revisar` | `nao_recomendado`.
- Falha do agente ou dado ausente: o pedido segue ao humano marcado “sem score”; nunca é aprovado sozinho.
- Aprovação automática por score fica **fora** desta decisão e exige decisão futura própria.

### 2.3 Quem decide

- Administrador da plataforma EIAH = lista fixa de e-mails no servidor (`EIAH_PLATFORM_ADMIN_EMAILS`), começando por
  Carlos Alberto Merlo. Não é alterável pela interface e é independente do papel no tenant.
- Decide pela tela `/app/admin/aprovacoes` (fila ordenada pelo score) **e** pelo chat do front door, sempre com clique
  de confirmação explícito.
- Observação obrigatória ao recusar, ao revogar e ao decidir contra a recomendação do agente.
- A tela e o chat de administração mostram só os dados do pedido e os sinais do score, nunca dados de negócio ou PII
  do cliente.

### 2.4 Pedido e ativação pelo cliente

- Ordem de verificação: liberação da EIAH, depois `products.activate`.
- Só o Founder e quem tem `products.activate` podem **pedir** a liberação.
- Sem liberação: o Marketplace mostra “Solicitar liberação”/estado do pedido; o chat explica e oferece o pedido com
  confirmação.
- Aviso da decisão: gravado numa fila de avisos independente de canal; mostrado no app e, quando a API estiver
  pronta, enviado ao WhatsApp do cliente cadastrado, sem score nem dados de billing.
- Ativação pelo WhatsApp (“Quer ativar agora?”): só por botão interativo (texto livre não vale), com número
  verificado ligado a usuário com permissão no tenant, código de confirmação de uso único e validade curta preso à
  proposta, e nova verificação da liberação no momento. Canal registrado na auditoria.

### 2.5 Revogação

- O administrador escolhe o modo: (a) somente leitura (padrão), (b) bloqueio total, (c) sem nova ativação.
- Em todos os modos nada é apagado; o modo pode ser alterado ou a liberação restaurada, sempre com auditoria.

### 2.6 Migração

- Todo `TenantProductInstallation` ativo (qualquer vertical ou produto) vira liberação `aprovado`, marcada
  “aprovado na migração”, sem score e com decisor “sistema/migração”, válida só para aquele workspace.
- Depois do deploy, o agente calcula o score dessas liberações, que aparecem na aba “Aprovados na migração” para
  confirmação ou revogação; nada muda para o cliente sem ação humana.
- Quem consta como `activatedByUserId` dessas instalações recebe `products.activate` naquele workspace.

### 2.7 Acesso por link de senha no front door

- Quem cria acessos: regra atual (quem gerencia membros: Founder, Gestor, Admin).
- Só em workspace com pelo menos uma vertical liberada pela EIAH.
- Reaproveita o convite de workspace: link de uso único, validade de **72 horas para todos os convites**, mostrado
  uma vez a quem criou (e, quando disponível, enviado pelo WhatsApp); reemissão invalida o anterior.
- A pessoa define a própria senha; a EIAH nunca vê nem exibe a senha.
- E-mail que já tem conta: o link só adiciona a pessoa ao workspace, sem senha nova.
- Só pode conceder `products.activate` num convite ou papel quem já tem `products.activate` (fecha a brecha do §1).
- E-mail do convidado mascarado no histórico da conversa.

### 2.8 Conta de billing e primeira mensalidade pelo front door (complemento de 03/10/2026)

**Decisão de Carlos Alberto Merlo — 03/10/2026, America/Sao_Paulo.** Origem: resposta literal do usuário em conversa,
“sim às 4 recomendações”, às quatro recomendações apresentadas na mesma conversa e reproduzidas abaixo. Registro
textual, sem assinatura digital ou verificação independente de identidade.

1. A conta de billing **não** é obrigatória para pedir a liberação: a conversa avisa quando não há conta ativa e
   oferece criá-la antes do pedido; o pedido continua possível sem ela (o score mais baixo já sinaliza ao
   administrador).
2. Os planos oferecidos na conversa são os quatro perfis que já existem no código (`solo`, `starter`, `growth`,
   `scale`, em `packages/core/src/services/tenantInvoiceService.ts`), com os preços atuais. Nenhum preço novo.
3. O pagamento oferecido na conversa é **simulado** e registrado como tal. Cobrança real (Stripe, PIX ou outro meio)
   exige credenciais e decisão própria.
4. Esta decisão é registrada nesta ADR antes do código.

Regras de implementação:

- Quem cria a conta e paga a primeira mensalidade: o Founder e quem tem `products.activate` (as mesmas pessoas que
  podem pedir a liberação, §2.4). Criação e pagamento exigem clique de confirmação explícito na conversa.
- A conta é criada com o plano escolhido, status `active` e moeda BRL. Conta existente não é alterada pela conversa
  (troca de plano fica fora).
- Pagamento simulado: só quando o meio de pagamento está em modo `simulated`; em modo `full` a conversa recusa,
  porque não há integração real. O registro no `BillingLedger` é um evento de valor zero (`adjustment`, `amountCents`
  = 0) com o valor da mensalidade só na descrição e o modo `simulated` explícito, para não somar dinheiro inexistente
  em relatórios e conciliação. Uma única primeira mensalidade por tenant (idempotente).
- O pagamento simulado **não** conta como “pagamento confirmado” no score (`vertical-access-score.v1` permanece igual).
  Só a conta de billing ativa passa a contar, pela regra que já existe.
- A conversa não mostra score nem sinais de billing de outros tenants; não pede dados de cartão ou documento.

O que este complemento **não** faz: não cria preço novo, não liga cobrança real, não altera o IMOB Cost, o score, o
ruleset nem `docs/EVIDENCE_INDEX.md`, e não torna a conta de billing obrigatória para a liberação.

## 3. Implementação autorizada (PRs sequenciais)

| PR | Escopo |
| --- | --- |
| 2a | Fechar a brecha de concessão de `products.activate` e aplicar validade de 72 horas a todos os convites |
| 2b | Registro de liberação, migração (§2.6), barreira no serviço de ativação, lista de administradores, score por regras versionadas, tela `/app/admin/aprovacoes` |
| 2c | Pedido e decisão pelo chat do front door; fila de avisos no app; revogação nos três modos |
| 2d | Criação de acessos pelo front door (§2.7) |
| 2e | Canal WhatsApp para avisos e ativação, quando a API estiver disponível |
| 2f | Conta de billing e primeira mensalidade simulada pela conversa do front door (§2.8) |

Condições em cada PR: testes incluindo regressão fail-closed; `ChatAgentLauncher` apenas renderiza; isolamento
tenant/workspace e masking de PII preservados; status conforme `IA_EIAH.md` §17.

## 4. O que permanece fora

- Aprovação automática por score.
- Mudança de preço, cobrança real, IMOB Cost, ruleset e `docs/EVIDENCE_INDEX.md` (a criação de conta de billing e
  a primeira mensalidade **simulada** pela conversa estão autorizadas só nos termos do §2.8).
- Envio de e-mail.
- Uso de IA generativa para decidir o score (pode apenas resumir o caso, em decisão futura).

## 5. Evidência

Esta ADR é uma decisão, não evidência de execução, e não é indexada em `docs/EVIDENCE_INDEX.md`.
