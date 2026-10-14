#!/bin/zsh
# Publica a edge function das automações do Instagram e grava os segredos.
# A chave secreta do app é digitada aqui (não aparece na tela) e vai direto
# para o Supabase. O token de verificação do webhook é gerado e mostrado para
# colar no painel da Meta. Ver docs/INSTAGRAM_AUTOMACOES.md.
set -e
cd "$(dirname "$0")/.."
PROJETO=ucjyobemrxqfcoopkcgb
CLI=(npx -y supabase@latest)

if ! "${CLI[@]}" projects list >/dev/null 2>&1; then
  echo "→ Vai abrir o navegador para você entrar no Supabase."
  "${CLI[@]}" login
fi

echo
echo "Cole a 'Instagram app secret' (no painel da Meta, botão Show) e aperte Enter."
echo "Ela não aparece enquanto você cola, é normal."
read -rs "SEGREDO?Chave secreta: "
echo
[[ -z "$SEGREDO" ]] && { echo "Chave vazia, nada feito."; exit 1; }

VERIFY=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 24)
"${CLI[@]}" secrets set --project-ref "$PROJETO" META_APP_SECRET="$SEGREDO" META_VERIFY_TOKEN="$VERIFY" >/dev/null
unset SEGREDO
echo "✓ Segredos gravados no Supabase."

"${CLI[@]}" functions deploy instagram-automacoes --no-verify-jwt --project-ref "$PROJETO"
echo "✓ Função publicada."

echo
echo "Agora, no painel da Meta (passo 3, Configure webhooks):"
echo "  Callback URL:  https://$PROJETO.supabase.co/functions/v1/instagram-automacoes"
echo "  Verify token:  $VERIFY"
