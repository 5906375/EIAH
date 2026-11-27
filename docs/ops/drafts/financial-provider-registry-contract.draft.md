# Providers financeiros — cadastro e confirmação v1 (Proposta)

## Escopo

Contrato extensível para cadastrar integrações e avaliar confirmações de recebimento da cobrança EIAH, mantendo a escolha dos providers reais em aberto. Não fornece tela de cadastro, persistência, conexão externa, credenciais, processamento de cobrança, webhook ou alteração ao PRE_DUIMP. O módulo é um protótipo em `scripts/lib/financialProviderContract.ts`.

## Cadastro

Cada integração é identificada por ID próprio, ambiente (simulado, homologação ou produção), estado (cadastrada, em validação, habilitada ou suspensa), referências seguras às credenciais e à conta recebedora EIAH, combinações de meios/ativos suportados, política de confirmação e método de verificação. Capacidades de consulta, webhook, estorno e conciliação são declaradas separadamente.

O ambiente é parte da identidade lógica da integração; use IDs diferentes para cadastros de ambientes diferentes. O registro rejeita IDs repetidos. Valores de credenciais nunca devem ser armazenados nos campos de referência. O cadastro persistente, sua autorização administrativa, gestão de segredos e prova de titularidade da conta ficam pendentes.

| Meio | Representação |
| --- | --- |
| Pix | Ativo fiduciário BRL; moeda e precisão explícitas |
| Cartão de crédito | Moeda fiduciária suportada pela integração |
| Transferência bancária | Moeda fiduciária suportada pela integração |
| Transferência crypto | Identidade do ativo, rede e precisão explícitas |

A quantia é uma string inteira positiva em unidades atômicas (até 78 dígitos). Não há ponto flutuante nem equivalência automática entre crypto e BRL. O verificador real deve validar a precisão segundo o ativo/provider; declarar uma precisão no payload não comprova sua correção.

## Confirmação

O pedido esperado vincula tenant, obrigação, pagamento, provider, conta recebedora, meio, ativo e quantia. A confirmação deve reproduzir esse vínculo, identificar a transação, referência da evidência, ambiente, política de confirmação e instante observado.

- Iniciado ou autorizado: pendente, sem quitação.
- Confirmado: contrato internamente consistente após aceitação pelo verificador injetado.
- Estornado: reversão explícita; não é confirmação de recebimento vigente.
- Ausência, simulação, homologação, divergência, dado antigo/futuro ou falha de verificação: verificação indisponível.

O verificador injetado precisa comprovar habilitação do cadastro, titularidade da conta, autenticidade da evidência, ambiente e critérios de liquidação/finalidade da política contra os inputs exatos. Uma flag `enabled`, uma referência textual ou um retorno `true` de fixture não comprova esses fatos operacionalmente. O resultado sempre mantém elegibilidade operacional bloqueada e verificação independente não demonstrada. Nenhum verificador real é fornecido.

A interface `FinancialProviderReadAdapter` exige consulta da confirmação; cadastro pode declarar webhook, mas o handler, sua autenticação e a recuperação por consulta são trabalho posterior. A idade máxima aceita é parâmetro do avaliador, sem valor operacional aprovado.

## Relação com situação financeira

Este contrato não abate dívida nem libera tenant. A alocação de pagamentos confirmados à obrigação, idempotência, histórico de estornos, cobertura integral e atualização da situação financeira são etapas posteriores. O contrato atual `tenantFinancialStanding.v1` usa moeda fiduciária e centavos: crypto não pode ser convertido nem encaixado implicitamente nele. A integração precisará definir obrigação denominada no ativo ou conversão explícita aprovada, inclusive precisão e arredondamento, antes de aceitar crypto para quitar obrigação fiduciária.

São pendentes: providers reais, verificadores, regras por meio para confirmação/finalidade, chargeback/disputa, estorno parcial, múltiplas alocações, liquidação líquida versus valor pago, taxas, persistência e trilha auditável. Os adapters simulados legados permanecem inalterados. Não há ativação de cobrança, rollout ou novos gates operacionais.

## Testes propostos

```bash
node --import tsx --test scripts/tests/financialProviderContract.test.ts
pnpm exec tsc --noEmit --target ES2024 --module ESNext --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck --allowImportingTsExtensions --types node scripts/tests/financialProviderContract.test.ts
```

Fixtures dos quatro meios, ambientes simulados/homologação, estados de cadastro, identidade, conta, quantia, rede/ativo, política, validade temporal, verificação negativa e erro de dependência. Não são recibos reais. Agente: Codex; aplicação e checks WSL pelo usuário. ADR-009 permanece Proposta; elegibilidade operacional bloqueada.
