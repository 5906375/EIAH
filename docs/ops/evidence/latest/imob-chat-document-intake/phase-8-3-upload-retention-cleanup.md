# IMOB Chat Document Intake — Phase 8.3 Upload Retention Cleanup

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: política de retenção e auto-delete seguro para uploads/DOCX do intake IMOB

## Objetivo

Reduzir risco de acúmulo de arquivos do piloto controlado sem alterar regras de negócio do intake, preservando `StorageProvider`, escopo `tenantId/workspaceId` e modo fail-closed quando a deleção não puder ser comprovada.

## Implementação

Arquivos principais:

- `apps/api/src/services/uploadRetentionService.ts`
- `apps/api/src/workers/uploadRetentionWorker.ts`
- `apps/api/src/tests/upload-retention-service.test.ts`
- `apps/api/src/index.ts`
- `.env.template`
- `docs/ops/imob-chat-intake-pilot-runbook.md`

Política implementada nesta fase:

- escopo restrito a `UploadedDocument.agentSlug = "imob-intake"`;
- retenção por idade usando `UploadedDocument.createdAt`;
- janela padrão de retenção: `30 dias` (`UPLOAD_RETENTION_DAYS=30`);
- worker desabilitado por padrão (`UPLOAD_CLEANUP_ENABLED=false`);
- quando habilitado, roda em `dry-run` por padrão (`UPLOAD_CLEANUP_DRY_RUN=true`);
- intervalo padrão do sweep: `6h` (`UPLOAD_CLEANUP_INTERVAL_MS=21600000`).

## Regras de segurança

O cleanup só remove o registro do banco depois de:

1. validar `storageKey` com `assertSafeStorageKey`;
2. confirmar que o objeto ainda existe no provider;
3. executar `deleteObject` no provider configurado;
4. confirmar que o objeto deixou de existir;
5. remover o registro de `uploaded_documents` no mesmo escopo `id + tenantId + workspaceId`.

Se qualquer uma dessas etapas falhar:

- o registro permanece no banco;
- o ciclo marca o item como `failed` ou `not_found`;
- o log não inclui nome de arquivo, conteúdo ou PII.

## Variáveis de ambiente

Adicionadas em `.env.template`:

```dotenv
UPLOAD_RETENTION_DAYS=30
UPLOAD_CLEANUP_ENABLED=false
UPLOAD_CLEANUP_DRY_RUN=true
UPLOAD_CLEANUP_INTERVAL_MS=21600000
```

Leitura operacional:

- `false/true`: modo mais seguro para piloto; nada é apagado, apenas candidatos são contabilizados.
- `true/true`: sweep automático com relatório operacional, sem deleção efetiva.
- `true/false`: deleção efetiva apenas para itens vencidos do intake IMOB.

## Limitação deliberada desta fase

Não foi introduzida migration no modelo `UploadedDocument`.

Motivo:

- o modelo atual já possui `createdAt`, `tenantId`, `workspaceId`, `agentSlug` e `storageKey`, suficientes para a política mínima do piloto;
- evitar schema churn nesta fase reduziu risco operacional.

Impacto:

- a política é baseada em idade do upload, não em metadado jurídico por documento;
- uploads associados a casos/runs ainda dentro da janela de retenção permanecem preservados pela própria janela temporal;
- revisão futura pode adicionar metadado explícito de retenção se produto/jurídico exigirem granularidade maior.

## Testes executados

### 1. Suíte unitária do serviço de retenção

Comando:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/upload-retention-service.test.ts
```

Resultado:

- `pass`
- exit limpo

Cobertura confirmada:

- documento expirado vira candidato;
- documento não expirado não é removido;
- `dry-run` não apaga arquivo nem registro;
- delete usa o provider configurado;
- filtro por `tenantId/workspaceId` preservado;
- `storageKey` legado continua tratado com segurança;
- falha de delete não remove o registro;
- objeto ausente também não remove o registro.

### 2. Gate do índice de evidências

Comando:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok: true`

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- draft store da Fase 8.1 não foi alterado;
- regras de negócio do intake não foram alteradas;
- nenhum `stage/status/journeyType` novo foi criado;
- multi-instância continua `NO-GO` sem object storage real.

## Conclusão

Resultado da fase:

- política de retenção definida para o piloto;
- cleanup automático implementado atrás de `env`;
- `dry-run` suportado por padrão;
- deleção efetiva confirmada somente quando o provider comprova remoção do objeto;
- status permanece `PILOTO CONTROLADO`.
