# Vertical Onboarding Checklist (D5)

## Produto
- [ ] Nome da vertical definido (`IMOB`, `LEGAL`, `HEALTH`...).
- [ ] Proposta de valor e público-alvo B2B descritos.
- [ ] Linguagem semântica da vertical definida (ex.: run -> processo/caso).

## Plataforma
- [ ] Registro de instalação por tenant/workspace ativo.
- [ ] Guard de acesso aplicado em `/app/<vertical>/*`.
- [ ] Menu dinâmico por instalação validado.
- [ ] Contexto de sessão inclui `productInstallations`.

## Operação
- [ ] Fluxo principal e2e validado (intenção -> execução -> evidência).
- [ ] Download de bundle/receipt disponível no Command Center.
- [ ] Fail-closed cross-tenant validado (`403` quando escopo inválido).
- [ ] Command Center da vertical expõe prova por run (`txId`, `bundle`, `receipt/verify`) quando aplicável.

## Rollout
- [ ] Critério `shadow` explícito e documentado.
- [ ] Critério `pilot` explícito e documentado.
- [ ] Critério `small` explícito e documentado.
- [ ] Evidência semanal da vertical publicada em `ops/evidence/latest`.
- [ ] Critério de avanço `shadow -> pilot -> small` ligado a gates de não-regressão.

## Economia
- [ ] PaymentIntent funcional no domínio.
- [ ] PoU-gated settlement validado.
- [ ] Reputação/disputa integradas quando aplicável.

## Evidências
- [ ] Evidência de ativação da vertical.
- [ ] Evidência de primeira execução operacional.
- [ ] KPI report com gates D6 atualizado.
- [ ] Evidência de rollout/piloto da vertical atualizada.
