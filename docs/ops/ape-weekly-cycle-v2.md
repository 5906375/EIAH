# APE weekly cycle v2

`ape.weekly-cycle.v2` é o contrato versionado de um artefato de medição APE
apto a ser avaliado futuramente pelo gate de recorrência P1.

Cada métrica inclui valor, fonte (`ledger` ou `runtime`), método/query
versionada, janela observada e digest SHA-256 da fonte. Zero medido é válido;
zero sem proveniência é inválido.

O receipt obrigatório `{id, hash, reasonCode, timestamp}` vincula o conteúdo
canônico do ciclo. A canonicalização ordena recursivamente as chaves de objetos,
preserva a ordem de arrays e exclui apenas `receipt.hash` antes do cálculo
SHA-256.

Este contrato valida a presença, forma e vínculo criptográfico do reason code,
mas não cria códigos novos. A pertinência ao catálogo canônico deverá ser
verificada pelo futuro checker externo.

Todo artefato nasce com `ratification.status=pending`. Automação pode produzir
evidência, mas não pode ratificar a própria evidência. `human-verified` e
`mergeActor` não são aceitos como declarações do produtor: o futuro checker
deverá resolvê-los externamente a partir de Git/GitHub.

Validade neste contrato significa validade da medição. O ciclo continua
pendente de ratificação e não fecha P1 por si só.
