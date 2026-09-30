# Situação financeira do tenant — validação local (2026-09-30)

## Evidência recebida

O usuário executou no WSL os testes com `node --import tsx --test`, o typecheck focado sem emissão e os três checks de whitespace. Os resultados foram apresentados no terminal desta conversa: 13/13 testes, zero falhas/skips; typecheck e whitespace retornaram ao prompt sem diagnósticos. Não foram fornecidos logs de execução independentes nem códigos de saída separados. `validation-record.json` é um registro desses resultados apresentados, não uma reprodução de stdout original.

O pacote recebido contém as duas fontes TypeScript, o contrato em rascunho e o Evidence Index atual. As três fontes coincidem byte a byte com o patch preparado. Seus SHA-256 estão no registro JSON; isso identifica os arquivos recebidos, sem atestar independentemente a árvore executada.

## Escopo validado com fixtures

- Saldo vencido confirmado, quitação completa e permanência dos demais gates.
- Pagamento parcial ou pendente, estorno integral e outras obrigações vencidas.
- Limite temporal do vencimento, zero e obrigações futuras.
- Consulta vazia dependente de origem e cobertura verificadas pelo verificador simulado.
- Falha de consulta/verificação distinguida de inadimplência.
- Rejeição de recibos simulados, escopo cruzado, duplicidade, referência órfã, moeda divergente e excesso de alocação.
- Valores numéricos inválidos, snapshot antigo/futuro e estados contraditórios.

## Origem verificável — proposta pendente

A obrigação deve vir de registro de cobrança EIAH aprovado, identificando tenant, finalidade, valor, moeda e vencimento. O pagamento deve vir de integração real ou conciliação bancária, com referência verificável e aplicação explícita à obrigação. A leitura deve cobrir integralmente obrigações, pagamentos e estornos pertinentes, preservando o instante observado e a política de validade aprovada.

Os adapters `stripe`, `crypto` e `bank` consultados em `settlementProviders.ts` são simulados; declarar modo `full` não troca sua implementação de liquidação. Uma PaymentIntent liquidada nesse fluxo não comprova quitação da cobrança EIAH. Nenhum desses adapters foi designado como fonte operacional neste incremento. A regra definida é bloquear novas operações por atraso confirmado até regularização; consulta indisponível bloqueia com motivo próprio, sem declarar inadimplência.

## Limites e status

Status parcial: verificador de origem simulado, sem fonte real, sem integração PRE_DUIMP, sem typecheck integral, sem comprovação financeira operacional. `independentSourceVerification` permanece `not_demonstrated`; `operationalEligibility` permanece `blocked`. Não implementa carência automática, estorno parcial, divisão de uma transação entre obrigações ou excedente em conta. Nenhum commit/push/deploy integra esta evidência. ADR-009 permanece Proposta; o runner financeiro e os demais bloqueios anteriores continuam pendentes.

Agentes envolvidos: Codex na preparação/revisão; usuário na aplicação e execução WSL.
