#!/bin/zsh
# Guarda a chave da OpenAI do Roy (imagens dos carrosséis) em ~/.infopro-hub/roy/config.json,
# sem a chave aparecer na tela nem no histórico. Testa antes de gravar.
#   zsh scripts/roy/salvar-chave-openai.sh
echo "Cole a chave nova da OpenAI (começa com sk-) e aperte Enter. Ela não aparece enquanto você cola."
read -rs CHAVE
echo
CHAVE="$CHAVE" python3 - <<'PY'
import json, os, ssl, urllib.request, urllib.error
k = os.environ["CHAVE"].strip()
if not k.startswith("sk-"):
    raise SystemExit("Isso não parece uma chave da OpenAI (devia começar com sk-). Nada foi gravado.")
ctx = ssl.create_default_context(cafile=os.path.expanduser("~/.infopro-hub/py/certifi/cacert.pem"))
try:
    urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/models", headers={"Authorization": "Bearer " + k}), context=ctx, timeout=20)
except urllib.error.HTTPError as e:
    raise SystemExit(f"A OpenAI recusou essa chave (erro {e.code}). Nada foi gravado.")
arq = os.path.expanduser("~/.infopro-hub/roy/config.json")
c = json.load(open(arq)) if os.path.exists(arq) else {}
c["openai_api_key"] = k
fd = os.open(arq, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(c, f)
os.chmod(arq, 0o600)
print("Pronto: chave testada e guardada. O Roy já pode gerar imagens.")
PY
unset CHAVE
