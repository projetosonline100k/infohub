"""Monta as páginas do carrossel por código: HTML no estilo escolhido →
PNG no tamanho exato do estilo (1080×1350 no "Clássico marfim"), pelo Chrome
do Mac em modo headless. Assim o texto sai perfeito e todas as páginas têm
o mesmo tamanho. Só as ilustrações (escultura, ícone) vêm de imagem pronta
(ilustracoes.py).

conteudo.json:
  {"theme": "Tema", "caption": "legenda…",
   "slides": [{"titulo": "*6* HÁBITOS PARA MUDAR SUA *ROTINA*.",
               "texto": "Consistência começa nas escolhas que você repete.",
               "ilustracao": "escultura-pensador",   # arquivo em ilustracoes/ (opcional)
               "circulo": true,                       # círculo vermelho atrás (opcional)
               "icone": "icone-calendario"}]}         # ícone no topo direito (opcional)
  Entre *asteriscos* = cor de destaque. A paginação (01/08) é automática.

  python3 render.py <pasta> [--estilo classico-marfim] [--saida <pasta>]
"""
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
BASE = Path.home() / ".infopro-hub" / "roy"
FONTES = BASE / "fontes"
ILUSTRACOES = BASE / "ilustracoes"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def carregar_estilo(nome="classico-marfim"):
    p = Path(nome)
    if not p.suffix:
        p = AQUI / "estilos" / f"{nome}.json"
    return json.loads(p.read_text())


def normalizar(conteudo):
    """Aceita o formato antigo do ChatGPT ([titulo, texto, "01/08"])."""
    slides = []
    for s in conteudo["slides"]:
        if isinstance(s, list):
            s = {"titulo": s[0], "texto": s[1]}
        slides.append(dict(s))
    return slides


def _titulo_html(titulo):
    partes = re.split(r"(\*[^*]+\*)", titulo)
    out = []
    for p in partes:
        if p.startswith("*") and p.endswith("*"):
            out.append(f'<span class="d">{html.escape(p[1:-1])}</span>')
        else:
            out.append(html.escape(p))
    return "".join(out)


def _ilustracao(nome):
    if not nome:
        return None
    for ext in (".png", ".webp", ".jpg"):
        p = ILUSTRACOES / f"{nome}{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(f"ilustração não encontrada: {nome} (em {ILUSTRACOES})")


def contorno(arquivo, faixas=60):
    """Para cada faixa de altura da ilustração, onde começa a parte opaca
    (0 a 1 da largura, 1 = vazia). O HTML usa isso para tirar o texto de
    cima da escultura."""
    from PIL import Image
    alfa = Image.open(arquivo).convert("RGBA").getchannel("A")
    w, h = alfa.size
    px = alfa.load()
    saida = []
    for i in range(faixas):
        y0, y1 = int(h * i / faixas), max(int(h * (i + 1) / faixas), int(h * i / faixas) + 1)
        esq = w
        for y in range(y0, y1, max(1, (y1 - y0) // 4)):
            for x in range(0, w, 2):
                if px[x, y] > 128:
                    esq = min(esq, x)
                    break
        saida.append(round(esq / w, 3))
    return saida


def _nome_asset(arquivo, prefixo=""):
    """Nome do arquivo no Storage (sem colchetes/espaços)."""
    base = re.sub(r"[^A-Za-z0-9_.-]+", "-", Path(arquivo).stem).strip("-")
    return f"{prefixo}{base}{Path(arquivo).suffix.lower()}"


def assets_da_pagina(estilo, slide):
    """(arquivo local, nome no Storage) de tudo que a página carrega: fontes
    e ilustrações. Usado pra prévia ao vivo no Infopro (modelos)."""
    saida = [(FONTES / f["arquivo"], _nome_asset(f["arquivo"], f"fonte-{k}-")) for k, f in estilo["fontes"].items()]
    for chave in ("capa", "ilustracao", "icone"):
        if slide.get(chave):
            p = _ilustracao(slide[chave])
            saida.append((p, _nome_asset(p)))
    return saida


def pagina_html(estilo, slide, n, total, assets=None, marcadores=False):
    """HTML da página. `assets`: URL base no Storage (molde da prévia ao vivo),
    senão arquivos locais. `marcadores`: __TITULO__/__TEXTO__ no lugar do texto."""
    def url(arquivo, nome):
        return f"{assets}/{nome}" if assets else f"file://{arquivo}"
    nomes = dict((str(a), n_) for a, n_ in assets_da_pagina(estilo, slide)) if assets else {}
    src = lambda p: url(p, nomes.get(str(p)))  # noqa: E731
    L = estilo["layout"]
    C = estilo["cores"]
    F = estilo["fontes"]
    W, H = estilo["largura"], estilo["altura"]
    t, tx = L["titulo"], L["texto"]
    # Capa real (filme/livro citado) entra no lugar da escultura.
    capa = _ilustracao(slide.get("capa"))
    il = None if capa else _ilustracao(slide.get("ilustracao"))
    lc = L.get("capa", {"largura": 400, "direita": 74, "base": 150, "rotacao": 3})
    if capa:  # capa deitada (miniatura de vídeo, 16:9) entra mais larga
        from PIL import Image
        with Image.open(capa) as im:
            if im.width > im.height:  # texto em largura cheia, miniatura grande embaixo
                lc = {**lc, "largura": lc.get("largura_paisagem", 600), "largura_texto": lc.get("largura_texto_paisagem", 900),
                      "paisagem": True}
    ic = _ilustracao(slide.get("icone"))
    circ = L["ilustracao"]["circulo"]
    largura_titulo = t["largura_com_icone"] if ic else t["largura"]
    fontes_css = "\n".join(
        f'@font-face {{ font-family: "{f["familia"]}"; src: url("{src(FONTES / f["arquivo"])}"); font-weight: 100 900; }}'
        for f in F.values())
    num = f"{n:02d}"
    tot = f"{total:02d}"
    texto = "__TEXTO__" if marcadores else html.escape(slide.get("texto") or "").replace("\n", "<br>")
    titulo_html = "__TITULO__" if marcadores else _titulo_html(slide["titulo"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{fontes_css}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
body {{ position: relative; background: {C["papel"]}; color: {C["texto"]}; -webkit-font-smoothing: antialiased; }}
#papel {{ position: absolute; inset: 0; }}
#vinheta {{ position: absolute; inset: 0; background: radial-gradient(ellipse at 45% 40%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%, rgba(120,95,60,0.16) 100%); }}
.marca {{ position: absolute; left: {L["margem"]}px; top: {L["marca"]["topo"]}px; font: {L["marca"]["peso"]} {L["marca"]["tamanho"]}px "{F["marca"]["familia"]}"; letter-spacing: -0.2px; }}
#titulo {{ position: absolute; left: {L["margem"] - 6}px; top: {t["topo"]}px; width: {largura_titulo}px;
  font-family: "{F["titulo"]["familia"]}"; line-height: {t["altura_linha"]}; letter-spacing: -0.5px; z-index: 3;
  text-transform: {"uppercase" if t.get("caixa_alta", True) else "none"}; }}
#titulo .d {{ color: {C["destaque"]}; }}
#texto {{ position: absolute; left: {L["margem"]}px; width: {lc.get("largura_texto", tx["largura"]) if capa else tx["largura"]}px; font-family: "{F["texto"]["familia"]}";
  font-size: {tx["tamanho"]}px; font-weight: {tx.get("peso", 400)}; line-height: {tx["altura_linha"]}; letter-spacing: -0.3px; z-index: 3; }}
.pag {{ position: absolute; left: {L["margem"]}px; top: {L["paginacao"]["base"]}px; transform: translateY(-100%);
  font: 500 {L["paginacao"]["tamanho"]}px "{F["texto"]["familia"]}"; z-index: 3; }}
.pag b {{ color: {C["destaque"]}; font-weight: 500; }}
#circulo {{ position: absolute; width: {circ["diametro"]}px; height: {circ["diametro"]}px; border-radius: 50%;
  left: -9999px; background: {C["destaque"]}; z-index: 1;
  box-shadow: inset 0 0 60px rgba(60,0,0,0.35); }}
#escultura {{ position: absolute; right: {L["ilustracao"]["direita"]}px; bottom: {L["ilustracao"]["base"]}px; height: {L["ilustracao"]["altura"]}px; z-index: 2;
  filter: drop-shadow(-6px 10px 18px rgba(60,40,20,0.18)); }}
#capa {{ position: absolute; right: {lc["direita"]}px; bottom: {lc["base"]}px; width: {lc["largura"]}px; z-index: 2;
  transform: rotate({lc["rotacao"]}deg); border: 10px solid #F7F2E8; border-bottom-width: 12px;
  box-shadow: 0 2px 4px rgba(40,25,10,0.25), 0 22px 40px rgba(40,25,10,0.30); }}
#icone {{ position: absolute; top: {L["icone"]["topo"]}px; right: {L["icone"]["direita"]}px; width: {L["icone"]["tamanho"]}px; height: {L["icone"]["tamanho"]}px; object-fit: contain; z-index: 2; }}
</style></head><body>
<svg id="papel" width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
  <filter id="grao"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="{n * 7}" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.55 0"/></filter>
  <filter id="manchas"><feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="{n * 13}"/>
    <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0.22 0"/></filter>
  <rect width="100%" height="100%" filter="url(#manchas)" opacity="{L.get("papel", {}).get("manchas", 1)}"/>
  <rect width="100%" height="100%" filter="url(#grao)" opacity="{L.get("papel", {}).get("grao", 0.45)}"/>
</svg>
<div id="vinheta"></div>
<div class="marca">{html.escape(estilo["marca"])}</div>
<div id="titulo">{titulo_html}</div>
<div id="texto">{texto}</div>
{f'<div id="circulo"></div>' if (il or capa) and slide.get("circulo") else ""}
{f'<img id="capa" src="{src(capa)}" crossorigin="anonymous">' if capa else ""}
{f'<img id="escultura" src="{src(il)}" crossorigin="anonymous">' if il else ""}
{f'<img id="icone" src="{src(ic)}" crossorigin="anonymous">' if ic else ""}
<div class="pag"><b>{num}</b>/{tot}</div>
<script>
// Ajusta o título: o maior tamanho em que nenhuma palavra estoura a largura
// e o bloco cabe na altura máxima. Depois encaixa o texto logo abaixo.
const T = document.getElementById("titulo"), X = document.getElementById("texto");
const cfg = {json.dumps({"tmax": t["tamanho_max"], "tmin": t["tamanho_min"], "hmax": t["altura_max"],
                          "esp": tx["espaco_acima"], "xt": tx["tamanho"], "xmin": tx["tamanho_min"], "lim": tx["limite_inferior"],
                          "circ": circ,
                          "contorno": contorno(il) if il else ([0] * 60 if capa else None),
                          "circ_capa": lc.get("circulo", {"rel_x": 0.15, "rel_y": 0.2}),
                          "capa_min": lc.get("largura_min", 300), "paisagem": bool(lc.get("paisagem")),
                          "ilu_min": L["ilustracao"].get("altura_min", 480), "folga": 24})};
function cabe() {{
  return T.scrollHeight <= cfg.hmax && T.scrollWidth <= T.clientWidth + 1;
}}
function ajustar() {{
  let s = cfg.tmax;
  T.style.fontSize = s + "px";
  while (s > cfg.tmin && !cabe()) {{ s -= 2; T.style.fontSize = s + "px"; }}
  const fim = T.offsetTop + T.scrollHeight;
  X.style.top = (fim + cfg.esp) + "px";
  let x = cfg.xt;
  if (cfg.paisagem) {{  // texto termina acima da miniatura; se não couber, diminui texto e título
    const C = document.getElementById("capa");
    cfg.lim = C.getBoundingClientRect().top - 34;
    while (X.offsetTop + X.scrollHeight > cfg.lim && (x > cfg.xmin || s > cfg.tmin)) {{
      // Primeiro o título (até ~160 px), depois o texto, depois o título de novo.
      if (s > 160 || (x <= cfg.xmin && s > cfg.tmin)) {{ s -= 4; T.style.fontSize = s + "px"; X.style.top = (T.offsetTop + T.scrollHeight + cfg.esp) + "px"; }}
      else {{ x -= 1; X.style.fontSize = x + "px"; }}
    }}
  }}
  while (x > cfg.xmin && X.offsetTop + X.scrollHeight > cfg.lim) {{ x -= 1; X.style.fontSize = x + "px"; }}
  // Texto por cima da escultura? Diminui a escultura; se não bastar, a letra.
  const E0 = document.getElementById("escultura") || document.getElementById("capa");
  const linhasDe = (el) => {{ const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()]; }};
  const bate = () => {{
    if (!E0 || !cfg.contorno) return false;
    const b = E0.getBoundingClientRect(), n = cfg.contorno.length;
    for (const q of [...linhasDe(X), ...linhasDe(T)]) {{
      for (let i = 0; i < n; i++) {{
        const y0 = b.top + b.height * i / n, y1 = b.top + b.height * (i + 1) / n;
        if (y1 < q.top || y0 > q.bottom || cfg.contorno[i] >= 1) continue;
        if (b.left + b.width * cfg.contorno[i] < q.right + cfg.folga) return true;
      }}
    }}
    return false;
  }};
  if (E0) {{
    if (E0.id === "capa") {{
      let w = E0.offsetWidth;
      while (bate() && w > cfg.capa_min) {{ w -= 20; E0.style.width = w + "px"; }}
    }} else {{
      let h = E0.getBoundingClientRect().height;
      while (bate() && h > cfg.ilu_min) {{ h -= 20; E0.style.height = h + "px"; }}
    }}
    while (bate() && x > cfg.xmin) {{ x -= 1; X.style.fontSize = x + "px"; }}
  }}
  // Círculo atrás da cabeça: posição relativa à escultura.
  const E = document.getElementById("escultura") || document.getElementById("capa"), K = document.getElementById("circulo");
  if (E && K) {{
    const b = E.getBoundingClientRect(), d = cfg.circ.diametro, rel = E.id === "capa" ? cfg.circ_capa : cfg.circ;
    K.style.left = (b.left + b.width * rel.rel_x - d / 2) + "px";
    K.style.top = (b.top + b.height * rel.rel_y - d / 2) + "px";
    // O círculo nunca fica atrás do texto: desce até sair dele.
    const cruza = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
    const linhasTexto = [X, T].flatMap((el) => {{ const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()]; }});
    for (let i = 0; i < 40 && linhasTexto.some((q) => cruza(K.getBoundingClientRect(), q)); i++) K.style.top = (parseFloat(K.style.top) + 10) + "px";
  }}
  const caixa = (el) => {{ if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }};
  // Linhas reais do título (para conferir sobreposição com a escultura).
  const linhas = []; const rg = document.createRange(); rg.selectNodeContents(T);
  for (const q of rg.getClientRects()) linhas.push([Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]);
  document.body.setAttribute("data-relatorio", JSON.stringify({{
    titulo_px: s, texto_px: x, titulo: caixa(T), titulo_linhas: linhas, texto: caixa(X),
    escultura: caixa(document.getElementById("escultura")), capa: caixa(document.getElementById("capa")), icone: caixa(document.getElementById("icone")),
    estouro_titulo: !cabe(), estouro_texto: X.offsetTop + X.scrollHeight > cfg.lim, sobre_escultura: bate(),
    fontes: [...document.fonts].filter(f => f.status === "loaded").map(f => f.family),
  }}));
}}
Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => {{ i.onload = i.onerror = r; }}))]).then(ajustar);
</script>
</body></html>"""


def _chrome(args):
    return subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                           "--allow-file-access-from-files", "--force-device-scale-factor=1",
                           "--virtual-time-budget=4000", *args], capture_output=True, text=True, timeout=120)


def renderizar_pagina(estilo, slide, n, total, destino):
    W, H = estilo["largura"], estilo["altura"]
    with tempfile.TemporaryDirectory(prefix="roy-") as tmp:
        arq = Path(tmp) / f"p{n:02d}.html"
        arq.write_text(pagina_html(estilo, slide, n, total))
        png = Path(tmp) / "p.png"
        _chrome([f"--window-size={W},{H}", f"--screenshot={png}", f"file://{arq}"])
        dom = _chrome(["--dump-dom", f"file://{arq}"]).stdout
        if not png.exists():
            raise RuntimeError(f"o Chrome não gerou a página {n}")
        shutil.move(str(png), destino)
    m = re.search(r'data-relatorio="([^"]*)"', dom)
    return json.loads(html.unescape(m.group(1))) if m else {}


def renderizar(pasta, estilo="classico-marfim", saida=None):
    pasta = Path(pasta)
    est = carregar_estilo(estilo) if isinstance(estilo, str) else estilo
    conteudo = json.loads((pasta / "conteudo.json").read_text())
    slides = normalizar(conteudo)
    saida = Path(saida or pasta)
    saida.mkdir(parents=True, exist_ok=True)
    for velho in saida.glob("[0-9][0-9].png"):
        velho.unlink()
    relatorio = []
    for i, s in enumerate(slides, 1):
        r = renderizar_pagina(est, s, i, len(slides), saida / f"{i:02d}.png")
        r["pagina"] = f"{i:02d}"
        relatorio.append(r)
    (pasta / "render.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=1))
    return relatorio


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    estilo = args[args.index("--estilo") + 1] if "--estilo" in args else "classico-marfim"
    saida = args[args.index("--saida") + 1] if "--saida" in args else None
    for r in renderizar(args[0], estilo, saida):
        print(r["pagina"], "título", r.get("titulo_px"), "px · texto", r.get("texto_px"), "px",
              "· ESTOURO" if r.get("estouro_titulo") or r.get("estouro_texto") else "")
