# Aviso sobre os valores mascarados

Esta cópia pública das evidências do BACKUP-A teve identificadores operacionais removidos. Os marcadores abaixo **não são hashes, não são ETags, não são VersionIds e não são comprovantes criptográficos**; não podem ser usados para verificar integridade nem para localizar objetos.

- `<SHA256_MASKED_NN>` — no original havia um SHA-256 (hexadecimal). `<SHA256_B64_MASKED_NN>` — o mesmo SHA-256 em Base64. O mesmo `NN` significa que, nos registros privados originais, o valor era o mesmo; essa igualdade é uma afirmação do processo de sanitização, não é verificável publicamente.
- `<ETAG_MASKED_NN>` — ETag de objeto no armazenamento.
- `<S3_VERSION_ID>`, `<S3_BUCKET>`, `<S3_PREFIX>`, `<IAM_*>`, `<AWS_REGION>`, `<WSL_*>`, `<WINDOWS_*>` — identificadores de infraestrutura, conta, perfis e caminhos locais.

Frases como "hash confere", "coincide" ou "verificado" descrevem conferências feitas sobre os registros originais, que permanecem privados. Esta cópia, sozinha, não permite refazê-las. Capturas de tela e os manifestos originais não fazem parte desta cópia. Os `MANIFEST.public.sha256` ficam em cada diretório irmão `backup-a-*-2026-10-17` dentro de `ops/evidence/latest/` e, para este aviso, em `backup-a-public-notice-2026-10-24/`; cada um cobre apenas os arquivos publicados no respectivo diretório.
