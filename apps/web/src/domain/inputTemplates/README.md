# Data Input Templates

Templates padronizados para coleta de dados em chat (IMOB e outros verticais).

## Estrutura

- `types.ts`: tipos base (`DataInputTemplate`, `DataInputTemplateSection`).
- `imob.ts`: templates da vertical imobiliaria.
- `shared.ts`: templates genericos reutilizaveis por qualquer vertical.
- `index.ts`: registry, listagem, busca por id e formatacao para chat.

## IDs de template (IMOB)

- `imob.locacao_contrato_v2` (padrao oficial no chat IMOB)
- `imob.locacao_contrato`
- `imob.venda_contrato`
- `imob.proprietario_cadastro`
- `imob.locador_cadastro`
- `imob.locatario_cadastro`
- `imob.comprador_cadastro`

## IDs de template (shared)

- `shared.pessoa_basico`
- `shared.empresa_basico`

## Uso rapido

```ts
import { getDataInputTemplate, formatDataInputTemplate } from "@/domain/inputTemplates";

const template = getDataInputTemplate("imob.locacao_contrato");
const text = template ? formatDataInputTemplate(template) : "";
```
