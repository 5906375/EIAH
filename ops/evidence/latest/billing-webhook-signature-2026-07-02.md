# Billing webhook signature constant-time — 2026-07-02

## Escopo

- `apps/api/src/routes/billing.ts`
- `apps/api/src/tests/billing.webhook-signature.test.ts`

## Objetivo

Fortalecer a evidência do PR-3 com uma prova mínima mais próxima do fluxo real do webhook billing, sem ampliar escopo para corrigir a suíte integrada inteira de economy.

## Contexto confirmado

- `computeWebhookSignature(secret, base)` gera `HMAC-SHA256` em formato `hex`.
- O header do webhook aceita tanto valor cru quanto formato `sha256=<assinatura>`.
- A rota valida timestamp antes da assinatura; por isso, o teste HTTP precisa assinar com timestamp corrente para não cair no gate de replay.

## O que foi validado

### Teste unitário do helper

Cobertura direta de:

- assinatura válida crua;
- assinatura válida em `sha256=<assinatura>`;
- assinatura inválida com mesmo tamanho;
- assinatura com tamanho divergente;
- assinatura malformada/não-hex;
- normalização do header.

### Teste HTTP focado do webhook

Cobertura mínima do handler real:

- assinatura válida crua passa pelo gate de assinatura e alcança o fluxo seguinte da rota;
- assinatura válida com prefixo `sha256=` passa pelo gate de assinatura e alcança o fluxo seguinte da rota;
- assinatura inválida com mesmo tamanho falha com `401`;
- assinatura malformada falha com `401`;
- assinatura com tamanho divergente falha com `401`.

Para as assinaturas válidas, a prova operacional usada foi `404 PAYMENT_INTENT_NOT_FOUND`, o que demonstra que a requisição ultrapassou a verificação de assinatura e chegou à consulta do `paymentIntent`, sem exigir criação completa do fluxo economy.

## Limitações explícitas

- A suíte `apps/api/src/tests/billing.economy.contract.test.ts` não foi usada como evidência principal deste PR-3b porque mistura criação/liberação/settlement/idempotência do economy com o webhook, fugindo do escopo mínimo de assinatura.
- O teste HTTP com `supertest` precisou rodar fora do sandbox porque o bind da porta efêmera local retornou `listen EPERM` no ambiente restrito.
- O typecheck global da API permaneceu fora do escopo e não foi tratado aqui.

## Execução real

### 1. Teste focado do webhook billing

```bash
DATABASE_URL='postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public' node --import tsx --test --test-force-exit --test-reporter=spec apps/api/src/tests/billing.webhook-signature.test.ts
```

Saída observada:

```text
✔ Webhook billing signature: valor cru valido continua aceito
✔ Webhook billing signature: header no formato algo=assinatura continua aceito
✔ Webhook billing signature: assinatura invalida com mesmo tamanho falha
✔ Webhook billing signature: tamanho divergente falha sem throw
✔ Webhook billing signature: valor malformado nao-hex falha sem throw
✔ Webhook billing signature: normalizacao preserva o token apos o prefixo
✔ Webhook billing HTTP: assinatura valida crua passa pelo gate e alcanca o handler
✔ Webhook billing HTTP: assinatura valida com prefixo sha256 passa pelo gate e alcanca o handler
✔ Webhook billing HTTP: assinatura invalida com mesmo tamanho falha no gate
✔ Webhook billing HTTP: assinatura malformada nao-hex falha no gate sem throw
✔ Webhook billing HTTP: assinatura com tamanho divergente falha no gate
ℹ pass 11
ℹ fail 0
```

### 2. Import check da rota billing

```bash
DATABASE_URL='postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public' node --import tsx --eval "await import('./apps/api/src/routes/billing.ts'); console.log('billing-route-import-ok'); process.exit(0)"
```

Saída observada:

```text
billing-route-import-ok
```

## Conclusão

Status desta evidência: `evidenciado`

O PR-3 deixa de depender apenas de teste unitário do helper: agora há prova real do gate HTTP do webhook billing aceitando assinatura válida em ambos os formatos suportados e rejeitando variantes inválidas/malformadas/diferentes de tamanho sem `throw`.
