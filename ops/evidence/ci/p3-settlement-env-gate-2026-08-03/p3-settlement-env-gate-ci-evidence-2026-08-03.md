# Evidência de CI — `P3SettlementSupportByEnv` neutralizado na conclusão das runs

- **Data de congelamento:** 2026-08-03
- **Status:** `Proposta`
- **Repositório:** `5906375/EIAH`
- **Workflow:** `CI Monorepo`
- **Manifesto:** [manifest-ci.json](./manifest-ci.json)

## Resultado observado

| Run | Head SHA | Run | Job | Step nº 8 |
| --- | --- | --- | --- | --- |
| [30713272468](https://github.com/5906375/EIAH/actions/runs/30713272468) | `de228d3f7f0c7a430e6e933ce824947bde0d322c` | `success` | `P3SettlementSupportByEnv`: `failure` | `Check P3 settlement support matrix by env`: `failure` |
| [30710850816](https://github.com/5906375/EIAH/actions/runs/30710850816) | `d5efce85f6939f2a80580b14f1807c166cbb456f` | `success` | `P3SettlementSupportByEnv`: `failure` | `Check P3 settlement support matrix by env`: `failure` |

Nas duas runs, o comando `check:p3-settlement-support-by-env` terminou com exit code 1 e produziu:

```json
{
  "ok": false,
  "check": "check:p3-settlement-support-by-env",
  "message": "provider_mode_not_allowed_for_environment",
  "details": {
    "environment": "staging",
    "violations": [
      {
        "provider": "stripe",
        "mode": "full",
        "allowedModes": ["simulated"]
      }
    ]
  }
}
```

Em `HEAD`, `.github/workflows/ci.yml:1005-1013` declara `continue-on-error: true` no job `P3SettlementSupportByEnv`. A busca integral no workflow encontrou somente dois jobs com essa declaração: o job informativo `imob_frontdoor_mobile_smoke_informative` em `.github/workflows/ci.yml:353-356`, que não aparece na lista de required checks, e `P3SettlementSupportByEnv` em `.github/workflows/ci.yml:1005-1013`.

Na consulta GET de 2026-08-03, o ruleset `main-protection-hard-gates`, ID `13498700`, tinha `enforcement=active`, `target=branch` e listava 20 required status checks, entre eles `P3SettlementSupportByEnv`. A consulta à proteção clássica de `main` respondeu HTTP 404, `Branch not protected`; a configuração observada vem do ruleset.

## O que esta evidência prova

Esta evidência prova, e apenas isto:

- nas runs `30713272468`, head SHA `de228d3f7f0c7a430e6e933ce824947bde0d322c`, e `30710850816`, head SHA `d5efce85f6939f2a80580b14f1807c166cbb456f`, o check `check:p3-settlement-support-by-env` reprovou com `provider_mode_not_allowed_for_environment`, `environment=staging`, `provider=stripe`, `mode=full`, `allowedModes=[simulated]` e exit code 1;
- o step nº 8 concluiu `failure` e o job `P3SettlementSupportByEnv` concluiu `failure` nas duas runs;
- as duas runs concluíram `success`;
- `.github/workflows/ci.yml:1013` contém `continue-on-error: true` no job `P3SettlementSupportByEnv`;
- na consulta de 2026-08-03, o ruleset `main-protection-hard-gates`, ID `13498700`, estava `active` e listava `P3SettlementSupportByEnv` entre 20 required status checks;
- `main` não tinha branch protection clássica nessa consulta, que respondeu HTTP 404; a proteção observada vinha do ruleset;
- dos jobs de `.github/workflows/ci.yml`, somente os dois identificados acima continham `continue-on-error`; o outro era informativo e não constava na lista de required checks coletada.

## O que esta evidência não prova

- Não prova que `scripts/generateP3EconomyEvidence.ts` é estático; isso é leitura de código, não execução.
- Não prova nada sobre staging real, produção ou comportamento de provedores de pagamento.
- Não prova intenção. A coincidência entre o required check com `continue-on-error` e o check discriminante é apenas observação factual.
- Não prova o estado do ruleset em qualquer data anterior a 2026-08-03.
- Não prova o efeito prático sobre merge, pois nenhuma tentativa de merge foi executada. A consequência sobre bloqueio é inferência sobre a plataforma, não verificação.
- Não prova que outras runs apresentem o mesmo resultado.

## Tensão documental preservada

`docs/ops/evidence/main-hard-gates-applied-2026-07-27.md:62` classifica o P0 “main sem hard gates de CI” como “Mitigado tecnicamente” porque os 20 required checks estavam configurados. A configuração é confirmada. Esta evidência mostra que um desses checks concluiu `failure` e não impediu as duas runs de concluírem `success`. Isso registra tensão entre configuração e efeito observado, sem alterar ou corrigir o documento anterior.

O tema permanece ligado às frentes `DISCRIMINATE-P3-EVIDENCE-MODE`, `RATIFY-REASON-CODE-CANON-ENFORCEMENT` e `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT` em `docs/ops/open-fronts.md`, às notas de contenção dos commits `7d8fbfe` e `1ff679c` e a `docs/adr/ADR-003-work-registry-hierarchy.md`. Este artefato não resolve, inicia, promove nem rebaixa qualquer frente ou status.

## Proveniência e retenção

A coleta foi realizada por operador humano autenticado via `gh`, com escopos `gist`, `read:org`, `repo` e `workflow`, sem escopo administrativo. O agente não coletou diretamente; os comandos fora do sandbox foram executados somente mediante autorização do operador. Esse limite permanece relevante para `PROVISION-SANDBOX-GH-CREDENTIAL`.

Os metadados, estruturas de jobs, excerpts dos steps e respostas GET estão versionados junto deste registro. Os logs completos não estão no repositório:

| Run | Arquivo não versionado | Bytes | SHA-256 | Recuperação enquanto houver retenção do provedor |
| --- | --- | ---: | --- | --- |
| `30713272468` | `/tmp/p3-env-run-30713272468-full.log` | 2439705 | `b27e6cb9e07993d5e8e9e3397ba997661665ddd031a12dbd28521847b4d570d4` | `gh run view 30713272468 -R 5906375/EIAH --log` |
| `30710850816` | `/tmp/p3-env-run-30710850816-full.log` | 2437223 | `d4d4796024d3f3321f474c894dbdd7c33d50ddcf3230161027244d24b122b2d2` | `gh run view 30710850816 -R 5906375/EIAH --log` |

O SHA do commit de congelamento permanece em branco no manifesto até a criação do commit; a indexação referencia os arquivos presentes em `HEAD`, sem antecipar SHA.
