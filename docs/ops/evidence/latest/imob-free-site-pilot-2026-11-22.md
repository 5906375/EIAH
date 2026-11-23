# Piloto IMOB de vitrines gratuitas

Base consultada `db6c2d174654ae05de3eca5799c33ee17126401d`.

| Verificação executada localmente | Resultado |
| --- | --- |
| Fluxo de cadastro com DOM e IndexedDB simulados | E-mail de interesse dirigido à EIAH, prévia local sem pagamento e exportação de rascunho sem o perfil privado de cadastro. |
| Publicação estática em diretório temporário | Dez endereços criados. A décima primeira publicação foi recusada. A atualização de um endereço publicado preservou a vaga existente. |
| Verificador de deploy | Recusou um conjunto com onze vitrines. Endereço reservado e tentativa de caminho fora do IMOB foram recusados pelo gerador. |
| Geração HTML | Conteúdo de texto foi escapado, um endereço de foto com esquema impróprio foi ignorado e os dados privados do cadastro ficaram fora da página. Link de WhatsApp e foto em assets do IMOB foram renderizados. |
| Áudios do guia | `ffprobe` confirmou o hash da narração atual para `perfil`, `publicar` e `site-cliente`. |
| Wrangler 4.165.0 em dry-run | Executado a partir da raiz e de `apps/site`. O verificador leu 0 de 10 vitrines, e o Wrangler leu 133 arquivos e reconheceu os bindings SALAS e ASSETS. |
| `git diff --check` | Passou. |

Escopo da evidência local. Implantação em produção e envio de e-mail dependem da ativação do piloto.
