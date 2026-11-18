#!/bin/zsh
# Guarda o token da API de Conversões da Meta no Supabase (segredo META_CAPI_TOKENS = {"<id do pixel>":"<token>"}) e publica as funções.
# O token é digitado aqui (não aparece na tela nem fica em arquivo) e vai direto para o Supabase.
# Onde gerar: Gerenciador de Eventos → o conjunto de dados "Instalivros Quiz" → Configurações → API de Conversões → Gerar token de acesso.
# Uso:  scripts/capi-definir-token.sh            (pixel padrão: Instalivros Quiz)
#       scripts/capi-definir-token.sh <id-do-pixel>
set -e
cd "$(dirname "$0")/.."
PROJETO=ucjyobemrxqfcoopkcgb
PIXEL="${1:-1747450220135546}"
CLI=(npx -y supabase@latest)

if ! "${CLI[@]}" projects list >/dev/null 2>&1; then
  echo "→ Vai abrir o navegador para você entrar no Supabase."
  "${CLI[@]}" login
fi

echo
echo "Cole o token de acesso da API de Conversões do pixel $PIXEL e aperte Enter."
echo "Ele não aparece enquanto você cola, é normal."
read -rs "TOKEN?Token: "
echo
[[ ${#TOKEN} -lt 40 ]] && { echo "Token curto demais, nada feito."; exit 1; }

# Mantém os tokens de outros pixels que já estejam guardados (o segredo é um JSON só).
ATUAL=$("${CLI[@]}" secrets list --project-ref "$PROJETO" 2>/dev/null | grep -c META_CAPI_TOKENS || true)
[[ "$ATUAL" != "0" ]] && echo "ℹ️  Já existe META_CAPI_TOKENS: ele será substituído (o Supabase não mostra o valor antigo). Se você usa outros pixels, rode de novo para cada um."
JSON=$(PIXEL="$PIXEL" TOKEN="$TOKEN" python3 -c 'import json,os;print(json.dumps({os.environ["PIXEL"]:os.environ["TOKEN"]}))')
"${CLI[@]}" secrets set --project-ref "$PROJETO" --yes META_CAPI_TOKENS="$JSON" >/dev/null
unset TOKEN JSON
echo "✓ Token gravado no Supabase."

"${CLI[@]}" functions deploy quiz-capi --no-verify-jwt --project-ref "$PROJETO" --yes
"${CLI[@]}" functions deploy vendas-webhook --no-verify-jwt --project-ref "$PROJETO" --yes
echo "✓ Funções publicadas."
