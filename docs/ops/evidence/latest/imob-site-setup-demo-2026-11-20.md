# IMOB — Jornada de criação do site em demonstração

- Base: `de05e7bb3ca2174e0baef8080ea1bc20d6434496` (merge da PR #542).
- Ambiente: prévia estática executada localmente em navegador, com perfil, marca e dados fictícios.
- Entrada: catálogo da vertical e editor da Prévia 02, em `/imob/` e `/imob/ia-cliente/personalizar/`.

| Verificação executada | Resultado observado |
| --- | --- |
| Abrir **Criar meu site** no catálogo e no editor | A página apresentou as três etapas e manteve as ações posteriores condicionadas ao perfil/rascunho. |
| Salvar o perfil e importar a personalização | O rascunho mostrou a marca editada e um imóvel previamente editado. |
| Simular pagamento e publicar explicitamente | O pagamento liberou o botão de publicação. O link da vitrine publicada apareceu após essa ação, com a marca e as três fotos do imóvel editado. |
| Importar uma alteração posterior | A versão publicada permaneceu independente do novo rascunho. Depois de republicar, o nome atualizado do site apareceu na versão 2. |
| Revisar, contratar e ativar o J_360 | O escopo foi exibido antes da confirmação e a ativação foi uma ação própria na demonstração. |
| Contratar o FinNexus | A contratação apareceu registrada e a ativação continuou disponível como ação posterior. |
| Validar os módulos e links | `node --check` passou nos módulos e os destinos locais referenciados pelas quatro páginas checadas existem. |

Escopo da evidência: estado local do navegador. Cadastro institucional, autorização de pagamento, domínio de cliente, implantação pública por imobiliária, segredos de provedores e execução de agentes exigem integração e validação no produto real.
