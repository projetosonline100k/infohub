"""Gera as texturas de papel dos temas (public/texturas/*.png) — 25/10/2026.

Antes a textura era um filtro de ruído em SVG desenhado pelo navegador: bonito, mas caro de pintar ao rolar
documentos grandes (pior com zoom). Aqui ela vira uma imagem pequena que se repete (256 px, tileável): grão fino,
fibras curtas e, na capa, um toque de couro. A cor vem fixa; o ruído vira transparência.

    python3 scripts/gerar-texturas-papel.py
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

TAM = 256
SAIDA = Path(__file__).resolve().parents[1] / "public" / "texturas"


def tile_com_borda(desenhar, blur=0.0):
    """Desenha numa área 3x3 e recorta o meio: o que passa da borda volta do outro lado (sem emenda)."""
    grande = Image.new("L", (TAM * 3, TAM * 3), 0)
    d = ImageDraw.Draw(grande)
    for dx in (0, TAM, 2 * TAM):
        for dy in (0, TAM, 2 * TAM):
            desenhar(d, dx, dy)
    if blur:
        grande = grande.filter(ImageFilter.GaussianBlur(blur))
    return grande.crop((TAM, TAM, 2 * TAM, 2 * TAM))


def textura(cor, grao, fibras, couro=0, semente=1):
    rnd = random.Random(semente)
    # Grão: pontos soltos de intensidade variada.
    pontos = [(rnd.randrange(TAM), rnd.randrange(TAM), rnd.random()) for _ in range(int(TAM * TAM * 0.35))]
    camada_grao = tile_com_borda(lambda d, dx, dy: [d.point((x + dx, y + dy), int(255 * v * grao)) for x, y, v in pontos])
    # Fibras: tracinhos curtos em ângulos variados, quase invisíveis.
    tracos = []
    for _ in range(90):
        x, y = rnd.uniform(0, TAM), rnd.uniform(0, TAM)
        import math
        ang = rnd.uniform(0, math.pi)
        comp = rnd.uniform(4, 11)
        tracos.append((x, y, x + math.cos(ang) * comp, y + math.sin(ang) * comp, rnd.uniform(0.3, 0.7)))
    camada_fibra = tile_com_borda(lambda d, dx, dy: [d.line((x1 + dx, y1 + dy, x2 + dx, y2 + dy), fill=int(255 * v * fibras), width=1) for x1, y1, x2, y2, v in tracos], blur=0.35)
    alfa = Image.new("L", (TAM, TAM), 0)
    alfa.paste(camada_grao)
    alfa = Image.composite(camada_fibra, alfa, camada_fibra.point(lambda p: 255 if p > 0 else 0))
    if couro:
        # Couro/papel prensado: manchinhas suaves bem leves.
        manchas = [(rnd.randrange(TAM), rnd.randrange(TAM), rnd.uniform(2, 6), rnd.random()) for _ in range(260)]
        camada_couro = tile_com_borda(lambda d, dx, dy: [d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=int(255 * v * couro)) for x, y, r, v in manchas], blur=2.2)
        alfa = Image.eval(Image.merge("L", [alfa]), lambda p: p)
        alfa = Image.blend(alfa, camada_couro, 0.35)
    img = Image.new("RGBA", (TAM, TAM), (*cor, 0))
    img.putalpha(alfa)
    return img


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    marrom, creme, grafite = (44, 31, 18), (242, 234, 222), (70, 64, 54)
    # nome: (cor, grão, fibras, couro) — intensidades para dar ~3–7% na tela.
    pedidos = {
        "preto-lateral": (creme, 0.07, 0.10, 0.10),
        "preto-mesa": (creme, 0.09, 0.12, 0),
        "preto-folha": (creme, 0.11, 0.15, 0),
        "preto-card": (creme, 0.06, 0.08, 0),
        "vintage-lateral": (creme, 0.07, 0.10, 0.10),
        "vintage-mesa": (marrom, 0.10, 0.14, 0),
        "vintage-folha": (marrom, 0.12, 0.17, 0),
        "vintage-card": (marrom, 0.07, 0.10, 0),
        # Papel Branco (26/10): grafite morno bem fraco — de longe é branco liso; de perto, grão e fibra.
        "branco-lateral": (grafite, 0.05, 0.07, 0.05),
        "branco-mesa": (grafite, 0.06, 0.08, 0),
        "branco-folha": (grafite, 0.045, 0.065, 0),
        "branco-card": (grafite, 0.04, 0.055, 0),
    }
    for i, (nome, (cor, g, f, c)) in enumerate(pedidos.items()):
        caminho = SAIDA / f"{nome}.png"
        textura(cor, g, f, c, semente=i + 3).save(caminho, optimize=True)
        print(nome, caminho.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
