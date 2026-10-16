# YouTube (Shorts pela Dalila)

O canal do YouTube de cada projeto é ligado pelo login Google, igual à Agenda
(`docs/GOOGLE_CALENDAR.md`). Usa o **mesmo** cliente OAuth e a mesma chave de
criptografia da Agenda (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_TOKEN_ENCRYPTION_KEY`). Os tokens ficam em `youtube_conexoes`,
criptografados, sem acesso pelo app.

Fluxo: o Danilo entrega, o Davi aprova, a Dalila prepara o reel. Em
"Escolher data do reel" (`ProgramarReel.tsx`) o Davi marca **Também como Short
no YouTube** e confere o título (padrão: a headline do reel; a descrição é a
legenda). Na hora marcada, a edge `youtube` (rota `/publicar`, job `dalila-youtube`
do pg_cron, a cada minuto) sobe o mesmo vídeo no canal do projeto e grava o
link na tarefa da Dalila. O Instagram e o YouTube têm estados separados: um
falhar não trava o outro. Vídeo longo fica para a 2ª etapa.

## 1. Google Cloud (mesmo projeto da Agenda)

1. **APIs e serviços → Biblioteca**: ative a **YouTube Data API v3**.
2. **Credenciais → o cliente OAuth da Agenda**: acrescente a URI de redirecionamento

   ```text
   https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/youtube/callback
   ```

3. **Tela de consentimento (Google Auth Platform) → Acesso a dados**: acrescente os escopos
   `.../auth/youtube.upload` e `.../auth/youtube.readonly`.
4. **Público-alvo**: se o app estiver em **Teste**, a autorização vence em 7 dias
   (é o que já derruba a Agenda). Clique em **Publicar app** (Em produção). Sem
   verificação, o Google mostra o aviso "app não verificado" na hora de
   conectar (Avançado → continuar), mas a conexão não vence mais.
5. **Verificação** (opcional para uso interno, até 100 contas): em **Central de verificação**
   envie o pedido. Pede página inicial, política de privacidade (`/privacidade`
   já existe no app) e um vídeo mostrando o uso dos escopos.

Regras do `videos.insert` (documentação oficial conferida em 16/10/2026):
100 envios por dia, e "Videos uploaded from unverified API projects are not
restricted to private viewing mode". Então o padrão é sair **público**. Se o
YouTube devolver privado, isso fica em `reels.yt_privacidade` e aparece na
tarefa ("saiu PRIVADO: deixe público no YouTube Studio").
Para forçar privado ou não listado: segredo `YOUTUBE_PRIVACIDADE=private` (ou `unlisted`).

Short: vídeo vertical de até 3 min. O reel do Danilo (1080×1920) já é assim.

## 2. Supabase (nesta ordem)

```sh
python3 scripts/apply-dalila-youtube-shorts-migration.py --testar   # roda tudo e desfaz
python3 scripts/apply-dalila-youtube-shorts-migration.py
python3 scripts/reload-postgrest-schema.py
npx supabase@latest functions deploy youtube --no-verify-jwt --project-ref ucjyobemrxqfcoopkcgb
npx supabase@latest functions deploy dalila-publicar --no-verify-jwt --project-ref ucjyobemrxqfcoopkcgb
```

A migração vem antes do deploy: a `dalila-publicar` nova chama
`reel_links_na_tarefa` e só apaga o vídeo do Storage quando o Short não precisa
mais dele. `--no-verify-jwt` porque o callback é aberto pelo Google e o cron
manda a chave do Vault; as ações do app conferem o JWT dentro da função.

## 3. Teste

1. Conteúdo → Visão geral → botão **Conectar canal do YouTube** (canto de cima)
   → entrar com a conta Google **dona do canal** (em conta de marca, o Google
   pergunta qual canal).
2. O botão vira o nome do canal. Clicar nele desconecta.
3. No próximo reel, em "Escolher data do reel", marcar o YouTube e programar.
4. Acompanhar:
   `python3 scripts/consulta.py "select titulo, status, yt_status, yt_programado_para, yt_url, yt_privacidade, yt_mensagem from reels order by criado_em desc"`
   e as respostas da função em `net._http_response`.
