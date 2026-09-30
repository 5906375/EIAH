# Situação financeira do tenant — contrato v1 (Proposta)

Escopo: cobrança do serviço EIAH ao tenant. Não representa comissão imobiliária, transferência entre clientes ou qualquer PaymentIntent liquidada. O avaliador puro fica em `scripts/lib/tenantFinancialStanding.ts`; não está ligado ao PRE_DUIMP, ao banco ou a providers.

## Entrada e confiança

Obrigação: ID, tenant devedor, finalidade `eiah_service_fee`, valor inteiro seguro em centavos, moeda e vencimento. Pagamento: ID, tenant, obrigação, valor aplicado, moeda, estado, datas, provider, transação e referência de evidência. Snapshot: versão, tenant, origem, referência e instante observado.

O verificador injetado precisa comprovar a origem e a cobertura completa de obrigações, pagamentos e estornos do snapshot recebido. Não pode confiar em flags do payload, referências textuais ou `adapterMode: external` como prova suficiente. Nos testes ele é simulado. A implementação real desse verificador, a fonte canônica e a captura consistente continuam pendentes. Nenhum verificador operacional é fornecido nesta versão.

A idade máxima do snapshot é parâmetro explícito, não prazo operacional aprovado. Datas aceitas são UTC ISO canônicas com milissegundos. Datas de confirmação e estorno não podem ultrapassar o instante observado. O atraso começa estritamente após o vencimento. Consulta vazia só resulta em `current` quando o verificador confirma origem e cobertura.

## Decisão

| Condição | Resultado | Decisão condicional |
| --- | --- | --- |
| Consulta válida e verificada sem saldo vencido | `current` / em dia | Prosseguir aos demais gates |
| Consulta válida e verificada com saldo vencido | `past_due` / atraso confirmado | Bloquear novas operações até regularização |
| Consulta ausente, incompleta, antiga, inválida, simulada ou falha de verificação | `verification_unavailable` | Bloquear por indisponibilidade de verificação, sem declarar inadimplência |

O resultado sempre mantém `independentSourceVerification: not_demonstrated` e `operationalEligibility: blocked`. A decisão condicional dos fixtures não autoriza operação real. Não há exceção automática de carência. Não altera as regras de billing/grace do gate existente.

## Dinheiro, duplicidade e limites

Pagamento pendente não abate saldo. Pagamento confirmado abate apenas sua obrigação. Estorno integral remove esse abatimento. Outro saldo vencido mantém o bloqueio após quitação de uma obrigação. IDs duplicados, transação repetida dentro do provider, referência órfã, mistura de moeda, escopo incorreto e alocação acima do valor da obrigação tornam a verificação indisponível.

V1 exige uma moeda por obrigação e uma alocação por transação; não implementa pagamento dividido entre obrigações, excedentes/crédito em conta, estorno parcial, cancelamento da obrigação, disputa ou isenção comercial. Esses casos precisam de contrato próprio antes de integração. A integridade das informações e atualização após regularização/estorno dependerão da fonte real; a v1 não prova essa integridade.

## Validação proposta no repositório

```bash
node --import tsx --test scripts/tests/tenantFinancialStanding.test.ts
pnpm exec tsc --noEmit --target ES2024 --module ESNext --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck --allowImportingTsExtensions --types node scripts/tests/tenantFinancialStanding.test.ts
```

Agente: Codex; aplicação e verificações WSL pelo usuário. ADR-009 permanece Proposta; runner financeiro, CI, operações reais e retorno P1/P2 continuam pendentes/bloqueados conforme o estado anterior.
