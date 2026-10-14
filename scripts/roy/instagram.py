"""Leitura dos reels do @eu.davioficial (só leitura). O token fica na
tabela instagram_conexoes e nunca é impresso nem gravado em arquivo."""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

GRAPH = "https://graph.instagram.com/v25.0"
CONTA = "eu.davioficial"
CAMPOS = "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url"


def _ssl():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _token(username=CONTA):
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT access_token FROM public.instagram_conexoes WHERE username = %s", (username,))
        linha = q.fetchone()
    finally:
        c.close()
    if not linha:
        raise SystemExit(f"Sem conexão do Instagram para @{username}.")
    return linha[0]


def _get(url):
    with urllib.request.urlopen(url, context=_ssl(), timeout=60) as r:
        return json.load(r)


def midias(username=CONTA):
    """Todas as mídias do perfil (com paginação), da mais nova para a mais antiga
    pela data real (o fixado não muda a ordem)."""
    url = f"{GRAPH}/me/media?" + urllib.parse.urlencode({"fields": CAMPOS, "limit": 50, "access_token": _token(username)})
    itens = []
    while url:
        d = _get(url)
        itens += d.get("data", [])
        url = d.get("paging", {}).get("next")
    return sorted(itens, key=lambda m: m["timestamp"], reverse=True)


def reels(username=CONTA):
    return [m for m in midias(username) if m.get("media_product_type") == "REELS"]


def baixar(url, destino):
    with urllib.request.urlopen(url, context=_ssl(), timeout=300) as r, open(destino, "wb") as f:
        while bloco := r.read(1 << 20):
            f.write(bloco)
    return destino


if __name__ == "__main__":
    for m in midias():
        print(m["timestamp"][:10], m["id"], m.get("media_product_type"), m.get("media_type"),
              (m.get("caption") or "").replace("\n", " ")[:70])
