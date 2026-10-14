"""Capas reais: quando o carrossel cita filme, documentário, série ou livro,
a ilustração é o pôster/capa de verdade (pedido do Davi, 14/10/2026), não
uma escultura. Fica em ~/.infopro-hub/roy/ilustracoes/<nome>.jpg com um
<nome>.json ao lado (de onde veio, título e ano) pro referencia.txt.

  python3 capas.py filme <nome> "<título original>" [--ano 2020] [--id tt1234567]
  python3 capas.py livro <nome> "<título> <autor>"  [--n 1]
  python3 capas.py youtube <nome> <id-ou-link-do-vídeo>   (miniatura do vídeo, ex.: documentário no YouTube)
  python3 capas.py url   <nome> <url-da-imagem> "<descrição>"

Sempre confira a imagem baixada (título, ano, edição em português quando
houver) antes de usar: a busca devolve o primeiro resultado parecido.
Filmes: IMDb (pôster em alta). Livros: Apple Books (Brasil), Open Library
como reserva.
"""
import json
import re
import sys
import urllib.parse
import urllib.request

from render import ILUSTRACOES

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) InfoproRoy/1.0"}
TIPOS_FILME = {"feature", "TV mini-series", "TV series", "TV movie", "documentary", "TV special", "video"}


def _ssl():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _get(url, binario=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), context=_ssl(), timeout=60) as r:
        dados = r.read()
    return dados if binario else json.loads(dados)


def _salvar(nome, url_imagem, info):
    from PIL import Image
    ILUSTRACOES.mkdir(parents=True, exist_ok=True)
    destino = ILUSTRACOES / f"{nome}.jpg"
    destino.write_bytes(_get(url_imagem, binario=True))
    with Image.open(destino) as im:
        info["tamanho"] = f"{im.width}x{im.height}"
        if im.width < 500:
            print(f"ATENÇÃO: imagem pequena ({im.width}px de largura), pode sair borrada.")
    info["imagem"] = url_imagem
    (ILUSTRACOES / f"{nome}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1))
    print(f"{destino}\n{info.get('titulo')} ({info.get('ano')}) · {info['tamanho']} · {info.get('fonte')}")
    return destino


def filme(nome, titulo, ano=None, imdb_id=None):
    chave = re.sub(r"[^a-z0-9]+", "_", titulo.lower()).strip("_")
    achados = []
    # A busca do IMDb às vezes só acha sem o artigo ("century_of_the_self").
    for k in dict.fromkeys([chave, re.sub(r"^(the|a|an|o|os|as)_", "", chave)]):
        d = _get(f"https://v3.sg.media-imdb.com/suggestion/x/{urllib.parse.quote(k)}.json")
        achados = [r for r in d.get("d", []) if r.get("id", "").startswith("tt") and (r.get("i") or {}).get("imageUrl")]
        if imdb_id:
            achados = [r for r in achados if r["id"] == imdb_id]
        else:
            achados = [r for r in achados if r.get("q") in TIPOS_FILME and (not ano or r.get("y") == int(ano))]
        if achados:
            break
    if not achados:
        raise SystemExit(f"Não achei pôster para “{titulo}”{f' ({ano})' if ano else ''} no IMDb. Use: capas.py url …")
    r = achados[0]
    img = r["i"]["imageUrl"]
    # O IMDb aceita pedir uma largura: até 1200 px já sobra pra página.
    if r["i"].get("width", 0) > 1200:
        img = re.sub(r"\._V1_.*\.jpg$", "._V1_SX1200.jpg", img)
    return _salvar(nome, img, {"tipo": "filme", "titulo": r.get("l"), "ano": r.get("y"), "formato": r.get("q"),
                               "fonte": f"IMDb {r['id']}", "link": f"https://www.imdb.com/title/{r['id']}/"})


def livro(nome, busca, n=1):
    q = urllib.parse.urlencode({"term": busca, "media": "ebook", "country": "br", "limit": 5})
    res = _get(f"https://itunes.apple.com/search?{q}").get("results", [])
    for i, r in enumerate(res, 1):  # a busca erra edição (ex.: "Caderno de Atividades"): conferir e escolher --n
        print(f"{'→' if i == n else ' '} {i}. {r.get('trackName')} · {r.get('artistName')} · {(r.get('releaseDate') or '')[:4]}")
    if len(res) >= n:
        r = res[n - 1]
        img = r["artworkUrl100"].replace("100x100bb", "1400x1400bb")
        return _salvar(nome, img, {"tipo": "livro", "titulo": r.get("trackName"), "autor": r.get("artistName"),
                                   "ano": (r.get("releaseDate") or "")[:4], "fonte": "Apple Books (BR)",
                                   "link": r.get("trackViewUrl")})
    q = urllib.parse.urlencode({"q": busca, "limit": 5, "fields": "title,author_name,first_publish_year,cover_i"})
    docs = [x for x in _get(f"https://openlibrary.org/search.json?{q}").get("docs", []) if x.get("cover_i")]
    if not docs:
        raise SystemExit(f"Não achei capa para “{busca}”. Use: capas.py url …")
    x = docs[0]
    return _salvar(nome, f"https://covers.openlibrary.org/b/id/{x['cover_i']}-L.jpg",
                   {"tipo": "livro", "titulo": x.get("title"), "autor": ", ".join(x.get("author_name", [])),
                    "ano": x.get("first_publish_year"), "fonte": "Open Library"})


def youtube(nome, video):
    """Documentário/vídeo do YouTube: a "capa real" é a miniatura do vídeo."""
    vid = re.search(r"(?:v=|youtu\.be/|shorts/)?([A-Za-z0-9_-]{11})(?:\b|$)", video).group(1)
    for qual in ("maxresdefault", "sddefault", "hqdefault"):
        url = f"https://i.ytimg.com/vi/{vid}/{qual}.jpg"
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers=UA, method="HEAD"), context=_ssl(), timeout=30)
        except Exception:
            continue
        titulo = None
        try:
            o = _get("https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"}))
            titulo = f"{o.get('title')} · {o.get('author_name')}"
        except Exception:
            pass
        return _salvar(nome, url, {"tipo": "youtube", "titulo": titulo or vid, "fonte": "YouTube",
                                   "link": f"https://www.youtube.com/watch?v={vid}"})
    raise SystemExit(f"Não achei a miniatura do vídeo {vid}.")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 3:
        raise SystemExit(__doc__)
    opc = lambda k: a[a.index(k) + 1] if k in a else None  # noqa: E731
    if a[0] == "filme":
        filme(a[1], a[2], opc("--ano"), opc("--id"))
    elif a[0] == "livro":
        livro(a[1], a[2], int(opc("--n") or 1))
    elif a[0] == "youtube":
        youtube(a[1], a[2])
    elif a[0] == "url":
        _salvar(a[1], a[2], {"tipo": "manual", "titulo": a[3] if len(a) > 3 else a[1], "fonte": a[2]})
    else:
        raise SystemExit(__doc__)
