"""Ilustrações do Roy (escultura e ícone) pela API de imagens da OpenAI.
Autorizado pelo Davi em 14/10/2026. A chave fica em
~/.infopro-hub/roy/config.json (openai_api_key, chmod 600) e nunca é
impressa. As imagens ficam em ~/.infopro-hub/roy/ilustracoes/<nome>.png e
são reaproveitadas entre carrosséis (só gera o que ainda não existe).

Se a imagem vier com fundo, o recorte do macOS (bin/recortar, Vision) tira.

  python3 ilustracoes.py escultura <nome> "<pose em inglês>" [--estilo classico-marfim]
  python3 ilustracoes.py icone <nome> "<assunto em inglês>"
  python3 ilustracoes.py listar
"""
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from render import ILUSTRACOES, BASE, carregar_estilo

CFG = BASE / "config.json"
RECORTAR = BASE / "bin" / "recortar"
GASTOS = BASE / "gastos.jsonl"
# Preço por imagem (US$), conferido em 14/10/2026 em
# developers.openai.com/api/docs/guides/image-generation.
PRECOS = {
    ("gpt-image-1.5", "low", "1024x1024"): 0.009, ("gpt-image-1.5", "medium", "1024x1024"): 0.034,
    ("gpt-image-1.5", "high", "1024x1024"): 0.133, ("gpt-image-1.5", "low", "1024x1536"): 0.013,
    ("gpt-image-1.5", "medium", "1024x1536"): 0.05, ("gpt-image-1.5", "high", "1024x1536"): 0.2,
}


def _chave():
    if not CFG.exists():
        raise SystemExit("Falta a chave da OpenAI em ~/.infopro-hub/roy/config.json (o Davi grava pelo Terminal).")
    k = json.loads(CFG.read_text()).get("openai_api_key", "")
    if not k:
        raise SystemExit("O config do Roy não tem openai_api_key.")
    return k


def _ssl():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def gerar(prompt, destino, modelo="gpt-image-1.5", qualidade="medium", tamanho="1024x1024", transparente=True):
    corpo = {"model": modelo, "prompt": prompt, "size": tamanho, "quality": qualidade, "n": 1, "output_format": "png"}
    if transparente:
        corpo["background"] = "transparent"
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(corpo).encode(),
                                 headers={"Authorization": f"Bearer {_chave()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=_ssl(), timeout=300) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:400]
        if transparente and "background" in msg:  # modelo sem fundo transparente: gera com fundo e recorta
            return gerar(prompt.replace("fully transparent background", "plain flat light grey background"),
                         destino, modelo, qualidade, tamanho, transparente=False)
        raise RuntimeError(f"OpenAI recusou ({e.code}): {msg}") from None
    bruto = Path(destino).with_suffix(".bruto.png")
    bruto.write_bytes(base64.b64decode(d["data"][0]["b64_json"]))
    with open(GASTOS, "a") as f:
        f.write(json.dumps({"quando": datetime.now().isoformat(timespec="seconds"), "modelo": modelo,
                            "qualidade": qualidade, "tamanho": tamanho, "arquivo": Path(destino).name,
                            "usd": PRECOS.get((modelo, qualidade, tamanho))}) + "\n")
    _recortar_se_preciso(bruto, Path(destino))
    return Path(destino)


def _recortar_se_preciso(bruto, destino):
    """Fundo transparente de verdade → só apara as bordas vazias. Fundo
    sólido → recorta o objeto com o Vision do macOS."""
    from PIL import Image
    im = Image.open(bruto).convert("RGBA")
    alfa = im.getchannel("A")
    transparente = alfa.getextrema()[0] < 10 and sum(1 for p in alfa.getdata() if p < 10) > im.width * im.height * 0.05
    if transparente:
        im.crop(alfa.getbbox()).save(destino)
    else:
        subprocess.run([str(RECORTAR), str(bruto), str(destino)], check=True)


def escultura(nome, pose, estilo="classico-marfim", forcar=False):
    destino = ILUSTRACOES / f"{nome}.png"
    if destino.exists() and not forcar:
        return destino
    e = carregar_estilo(estilo)["ilustracoes"]
    return gerar(e["prompt_escultura"].format(pose=pose), destino, e["modelo"], e["qualidade_escultura"], "1024x1536")


def icone(nome, assunto, estilo="classico-marfim", forcar=False):
    destino = ILUSTRACOES / f"{nome}.png"
    if destino.exists() and not forcar:
        return destino
    e = carregar_estilo(estilo)["ilustracoes"]
    return gerar(e["prompt_icone"].format(assunto=assunto), destino, e["modelo"], e["qualidade_icone"], "1024x1024")


if __name__ == "__main__":
    ILUSTRACOES.mkdir(parents=True, exist_ok=True)
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    if a[0] == "listar":
        for p in sorted(ILUSTRACOES.glob("*.png")):
            if not p.name.endswith(".bruto.png"):
                print(p.stem)
    elif a[0] in ("escultura", "icone"):
        estilo = a[a.index("--estilo") + 1] if "--estilo" in a else "classico-marfim"
        f = escultura if a[0] == "escultura" else icone
        print(f(a[1], a[2], estilo, forcar="--forcar" in a))
    else:
        raise SystemExit(__doc__)
