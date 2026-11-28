# IMOB — Gravação dos dados do rodapé da demonstração

- Base: `899528d7bf92b373553f52d6adf2f1d9917b469b` (PR #543).
- Execução: código editado de `brand-editor.mjs` e módulos de marca e rodapé executados em JavaScript com DOM e armazenamento simulados. Dados fictícios em todos os casos.

| Verificação | Resultado |
| --- | --- |
| Abertura pelo destino da aba Contatos | Botão Salvar dados do rodapé selecionado e contatos existentes carregados. |
| Gravação com Marca e Apresentação vazias | Contatos gravados com confirmação do rodapé. |
| Edição de rodapé com marca previamente salva | Marca, apresentação e logo anteriores preservados mesmo com um nome diferente em edição. |
| Validação de contatos | Telefone e e-mail inválidos rejeitados. Telefone, WhatsApp e e-mail válidos geraram os links esperados. |
| Atalho no rascunho | O link aponta para o identificador existente da aba Contatos. |

A sessão não disponibilizou um navegador para validar a correção em prévia ou no domínio público.
