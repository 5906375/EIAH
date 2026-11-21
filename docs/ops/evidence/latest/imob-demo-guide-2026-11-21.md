# Guia da demo IMOB

Base `e63a22facebf8e5f77bc6397d93644ecd4ef6188` do piloto de temporada. As verificações de interface usaram a prévia local em Chromium.

| Verificação | Resultado observado |
| --- | --- |
| Ajuda contextual | Na vitrine de temporada, o guia abriu o assunto de datas e estadia. Na equipe, abriu a orientação de confirmação e check-in. |
| Catálogo e atalhos | Todos os recursos exibiu orientações de atendimento, fila, editor, rodapé, voz e especialistas. O atalho de check-in levou à fila de temporada. |
| Reprodução de áudio | A síntese do navegador retornou indisponível durante o teste inicial. Os áudios empacotados tocaram na prévia. Foi possível usar Parar áudio e fechar o guia com Escape, que devolveu o foco ao botão do guia. |
| Cobertura e integridade | Foram conferidos 13 assuntos, suas descrições, passos e destinos, e a inclusão do guia nas oito páginas da demo. O comando `node scripts/generateImobDemoGuideAudio.mjs --check` confirmou a correspondência do texto com as 13 narrações. |
| Pacote | `node --check` nos módulos alterados e `wrangler deploy --dry-run --config apps/site/wrangler.jsonc` passaram. O Wrangler reconheceu 115 arquivos estáticos. |

O catálogo em `apps/site/public/imob/demo-guide-content.mjs` fornece o texto da interface e a origem das narrações. Após editar um assunto, regenere as faixas com `node scripts/generateImobDemoGuideAudio.mjs /caminho/espeak-ng.js` e valide com `--check`. O gerador documenta a versão do eSpeak NG usada. A prévia distribui somente o áudio gerado. A verificação é do guia instrucional da demo.

## Ajuda de cada seção

- Em Chromium, ao alternar entre venda, aluguel anual e temporada na mesma página, o botão Como funciona? dos resultados abriu a orientação correspondente e reproduziu o áudio em cada modo.
- A abertura direta também foi verificada na Vitrine de imóveis, na fila de temporada, em Contatos e rodapé e em Especialistas EIAH. Escape devolveu o foco ao botão de origem.
- A checagem dos arquivos confirmou 44 atalhos nas oito páginas, 28 assuntos com destinos válidos e as 28 narrações atualizadas. A conferência de sintaxe e o dry-run do Wrangler passaram. O Wrangler reconheceu 130 arquivos estáticos.
