# Migração Supabase — 11/09/2026

Destino: `ucjyobemrxqfcoopkcgb`.

## Concluído

- Conexão PostgreSQL validada com TLS e certificado CA do Supabase.
- Backup `infopro-hub-panel_260911.backup` restaurado em transação, com contagens verificadas antes do commit: 1.181 registros em 55 tabelas, incluindo tabelas vazias.
- Restauradas 25 tabelas públicas, 5 clientes, 121 vídeos verticais, 690 respostas de pesquisa e 2 usuários de autenticação.
- Preservadas as estruturas internas e migrações de plataforma do novo Supabase. Concessões ao papel antigo `sandbox_exec` foram excluídas por não existir no destino.
- Aplicadas as quatro migrações locais de julho a setembro de 2026 (arquivos de vídeo, arquivos editados, propriedade dos dados e permissões de equipe).
- Corrigida a migração de propriedade: `conhecimentos` é um bucket de Storage, não uma tabela pública do backup.
- Testes SQL de permissões passaram; registros temporários descartados via savepoint. Proprietário vê todos os clientes; usuário anônimo não vê clientes.
- `.env`, `.env.local` e `supabase/config.toml` apontam para o destino.
- Build Vite, cinco testes de equipe e verificação HTTP da API passaram. API anônima retorna zero clientes e cinco pesquisas públicas.
- Os sete banners públicos foram copiados para o novo Storage e verificados por SHA-256 após download do destino.
- As URLs dos banners de duas pesquisas foram atualizadas; não restam referências ao Storage antigo na coluna `public.pesquisas.banner_url`.
- Corrigido o erro "Erro ao salvar cliente". A causa era `INSERT ... RETURNING`: a política avalia o `SELECT` antes de a linha nova ficar visível à função `team_allowed`, que é `STABLE`. A migração `20260911010000` confere o proprietário direto na linha nesse caso e mantém a verificação de equipe nos demais. Aplicada e registrada em `supabase_migrations.schema_migrations`.
- Regressão `supabase/tests/client_save.sql` cobre criação com `RETURNING`, inclusão de equipe, edição pelo proprietário e isolamento de outra conta. Os dois testes SQL passam via `scripts/run-sql-tests.py`, que roda tudo em savepoint e desfaz no rollback.
- Os dois usuários migrados têm senha, e-mail confirmado, identidade `email` e não estão banidos nem excluídos — o login por senha está habilitado no destino.
- Build Vite e os cinco testes de `tests/equipe.test.mjs` passam.

## Pendente

- `admin-users` foi implantada com sucesso (12/09) usando a CLI do Supabase (instalada localmente via `npm install supabase --save-dev`, já que a instalação global não é suportada) e um token de acesso pessoal gerado pelo usuário, escopado só a este projeto e com expiração de 7 dias — usado apenas na sessão, não gravado em nenhum arquivo do repositório. `scripts/check-edge-functions.mjs` confirma: responde 401 ("Sessão inválida") em vez de 404, ou seja, está no ar e checando autenticação como esperado.
- As outras quatro (chat, process-pdf, backblaze-upload-url, instagram-insights) continuam fora do destino (404). Com a CLI já instalada e o projeto linkado, a implantação em si é rápida; falta um token de acesso válido (o gerado em 12/09 expira em 7 dias) e os segredos `LOVABLE_API_KEY`, `WINDSOR_API_KEY`, `WINDSOR_INSTAGRAM_ACCOUNT_ID`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `B2_REGION` e `B2_PUBLIC_BASE_URL`, nenhum fornecido ainda.
- O login com senha foi confirmado apenas pelo estado do banco; não houve autenticação real pela API, que exigiria a senha de uma das contas.
- A publicação do frontend não foi executada.

## Registros locais

`.migration.local/restore-result.json` contém as contagens verificadas; `.migration.local/storage-result.json` registra os hashes dos sete banners copiados. A pasta também guarda SQL extraído, lista de objetos restaurados, manifesto dos banners e a configuração anterior do aplicativo. A pasta e os backups estão ignorados pelo Git.

Scripts de verificação reaproveitáveis: `check-auth-users.py` (estado de login, nunca lê senhas), `run-sql-tests.py` (regressões SQL em savepoint) e `check-edge-functions.mjs` (sonda quais funções existem no destino).

Os scripts Python desta sessão usam `pg8000` e `certifi`, instalados temporariamente em `/private/tmp/infopro-db-check`. Se essa pasta for removida, reinstalar essas dependências antes de reutilizar os scripts. Não repetir `restore-migration.py --apply` no banco já restaurado; ele exige destino vazio.
