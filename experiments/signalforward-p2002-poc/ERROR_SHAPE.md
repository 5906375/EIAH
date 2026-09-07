# Formato real do erro P2002 — capturado empiricamente

Capturado via `capture-error.ts` contra PostgreSQL 16.11 descartável
(`eiah-signalforward-poc-pg`, porta 5544, sem dados de produção), usando
`@prisma/client@7.2.0` + `@prisma/adapter-pg@7.2.0` (mesmas versões pinadas no
baseline `11805d1934573281e2787c2442b546c172b76947`). Nenhuma credencial, URL
de conexão ou variável de ambiente está reproduzida abaixo.

## Violação da constraint da chave idempotente (SignalForwardRequest)

```json
{
  "errorConstructorName": "PrismaClientKnownRequestError",
  "isPrismaClientKnownRequestError": true,
  "code": "P2002",
  "metaKeys": ["modelName", "driverAdapterError"],
  "meta": {
    "modelName": "SignalForwardRequest",
    "driverAdapterError": {
      "name": "DriverAdapterError",
      "cause": {
        "originalCode": "23505",
        "originalMessage": "duplicate key value violates unique constraint \"signal_forward_requests_poc_tenant_id_workspace_id_destinat_key\"",
        "kind": "UniqueConstraintViolation",
        "constraint": {
          "fields": ["tenant_id", "workspace_id", "destination_agent", "idempotency_key"]
        }
      }
    }
  }
}
```

## Violação de OUTRA constraint (OtherUniqueFixture)

```json
{
  "code": "P2002",
  "meta": {
    "modelName": "OtherUniqueFixture",
    "driverAdapterError": {
      "cause": {
        "originalCode": "23505",
        "kind": "UniqueConstraintViolation",
        "constraint": { "fields": ["tenant_id", "external_ref"] }
      }
    }
  }
}
```

## Distinções confirmadas

| Conceito | Valor confirmado |
|---|---|
| Seletor composto Prisma (client-side, usado em `where:`) | `signalForwardIdempotencyKey` (nome dado explicitamente em `@@unique(..., name: "...")` no schema experimental) — nunca aparece no erro |
| Nome real da constraint no Postgres (gerado por convenção default do Prisma, sem `map:` explícito) | `signal_forward_requests_poc_tenant_id_workspace_id_destinat_key` (truncado em 63 caracteres pelo limite de identificador do Postgres) |
| Representação recebida pela aplicação (`error.meta`) | `{ modelName, driverAdapterError: { cause: { kind, constraint: { fields: string[] } } } }` — nomes de COLUNA (snake_case), não o seletor Prisma nem (diretamente) o nome da constraint |

## Consequência para o classificador

A classificação segura usa `meta.modelName` (contexto de qual modelo) +
`meta.driverAdapterError.cause.kind === "UniqueConstraintViolation"` +
`meta.driverAdapterError.cause.constraint.fields` (conjunto de colunas),
comparados contra o conjunto esperado da constraint da chave idempotente.
Qualquer ausência dessas chaves resulta em `unclassified`, nunca em uma
suposição otimista.
