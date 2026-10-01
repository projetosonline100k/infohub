# Google Calendar

A agenda usa OAuth 2.0 no backend. O navegador nunca recebe `client_secret`,
`access_token` ou `refresh_token`. Os tokens ficam criptografados com AES-GCM
e a tabela não concede acesso aos papéis `anon` ou `authenticated`.

## 1. Google Cloud

1. Crie ou selecione um projeto no Google Cloud Console.
2. Ative a **Google Calendar API**.
3. Configure a tela de consentimento OAuth. Durante testes, adicione os e-mails
   autorizados em **Test users**.
4. Crie uma credencial **OAuth client ID > Web application**.
5. Cadastre exatamente esta URI de redirecionamento:

   ```text
   https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/google-calendar/callback
   ```

6. Guarde o Client ID e o Client Secret.

Os escopos solicitados são `calendar` e `userinfo.email`. Como o aplicativo
edita eventos, o escopo de Calendar é sensível e pode exigir verificação do
Google antes de liberar o uso para pessoas fora da lista de teste.

## 2. Supabase

Gere uma chave aleatória com ao menos 32 caracteres e configure os segredos:

```sh
npx supabase secrets set \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="..." \
  GOOGLE_TOKEN_ENCRYPTION_KEY="uma-chave-aleatoria-com-32-ou-mais-caracteres" \
  APP_URL="https://infopro-hub.vercel.app"
```

Aplique a migration e publique a função:

```sh
npx supabase db push
npx supabase functions deploy google-calendar --no-verify-jwt
```

`--no-verify-jwt` é necessário porque o callback é aberto pelo Google. Todas
as ações da agenda continuam validando o JWT do usuário dentro da função; o
callback valida um nonce descartável com expiração de dez minutos.

## 3. Teste

1. Acesse `/agenda`.
2. Clique em **Conectar Google Calendar** e autorize a conta.
3. Verifique as visões Mês, Semana e Dia.
4. Crie, edite e exclua um evento e confirme a alteração no Google Calendar.
5. Desconecte a conta e confirme a revogação do acesso.
