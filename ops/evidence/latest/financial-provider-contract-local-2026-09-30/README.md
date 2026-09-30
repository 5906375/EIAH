# Providers financeiros — validação local (2026-09-30)

## Evidência recebida

O usuário executou no WSL os testes com `node --import tsx --test`, o typecheck focado sem emissão e os três checks de whitespace. O terminal apresentado na conversa registra 14/14 testes, zero falhas, cancelamentos, skips ou todo; typecheck e whitespace retornaram ao prompt sem diagnósticos. Não foram fornecidos logs independentes nem códigos de saída separados. `validation-record.json` registra os resultados apresentados; não reproduz stdout original nem declara uma nova execução desses comandos por Codex.

O pacote recebido contém as duas fontes TypeScript, o contrato em rascunho e o Evidence Index atual. Os SHA-256 e tamanhos das três fontes estão no registro JSON. Identificam os bytes recebidos, sem atestar independentemente a árvore executada no WSL.

## Escopo dos fixtures

- Pix, cartão de crédito, transferência bancária e transferência crypto.
- Cadastro por provider e ambiente, capacidades e combinações de meios/ativos.
- Bloqueio para cadastro não habilitado, simulação e homologação.
- Vínculo entre tenant, obrigação, pagamento, provider, conta, ativo e quantia.
- Iniciado/autorizado permanecem pendentes; estorno permanece explícito.
- Rejeição de duplicidades, dados divergentes, quantias inválidas, política divergente e evidência antiga/futura.
- Verificação negativa ou falha do verificador mantém indisponibilidade.
- Elegibilidade operacional bloqueada mesmo no fixture de confirmação consistente.

## Limites

A escolha dos providers reais permanece em aberto. Não há tela de cadastro, persistência, integração externa, verificador real, credenciais reais, webhook, conciliação operacional ou integração ao PRE_DUIMP. Os adapters simulados legados permanecem inalterados. Um cadastro `enabled` em ambiente `production` ou um verificador de fixture retornando `true` não comprova fonte financeira real.

Crypto exige ativo, rede e precisão explícitos; não há conversão automática para quitar obrigação em BRL. Alocação real, idempotência, cobertura integral, taxas, estorno parcial, chargeback e disputa permanecem pendentes.

Agente envolvido: Codex, preparação e revisão documental; usuário, aplicação e verificações WSL. Status parcial; ADR-009 permanece Proposta, verificação independente não demonstrada e elegibilidade operacional bloqueada. Não fecha P1/P2/P3 nem autoriza CI ou operações reais.
