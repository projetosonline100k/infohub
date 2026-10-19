"""Papel animado do Danilo (formato 'papel', pedido do Davi em 17-18/10/2026):
tela dividida, com uma folha de papel em cima onde cenas são desenhadas à mão
acompanhando a fala, e o vídeo editado embaixo, com um degradê entre os dois.

Igual à ideia do vídeo dos Maestros da IA: cada cena é uma função do tempo
cena(letras, d, u, k) que desenha o instante u (segundos desde o começo da
cena); os quadros vão direto pro ffmpeg, sem PNG no disco.

Cenas de cada edição: <pasta>/papel_cenas.py, escrito pelo Danilo (Claude):
    from papel import *            # traco, texto, circulo, marcatexto, boneco, prog, cores…
    FIM = 205.3                    # (opcional) tempo do BRUTO em que a tela volta a ser cheia (ex.: CTA do INSTALIVROS)
    CENAS = [(12.4, minha_cena), …]   # (início no tempo do BRUTO, função); cada cena fica até a próxima
A folha tem 940 x 560 unidades de desenho (x pra direita, y pra baixo). Exemplos
completos: scripts/danilo/papel_exemplo.py (o vídeo dos 4 hábitos).

    python3 papel.py contato <pasta>          → <pasta>/_papel_contato.jpg (cenas na metade de cada uma)
"""
import importlib.util
import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

S = 2                                   # escala do desenho (o compor ajusta)
FONTE = "/System/Library/Fonts/Noteworthy.ttc"
GRAFITE = (38, 36, 34)
AMARELO = (255, 214, 10)                # o amarelo das legendas do Davi
VERMELHO = (196, 52, 40)
AZUL = (70, 120, 190)
FPS = 30
PW, PH = 940, 560                       # folha em unidades de desenho


def suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def prog(t, a, b):
    return suave((t - a) / (b - a)) if b > a else float(t >= a)


# ---------------------------------------------------------------- papel
def papel(W=1080, H=1920):
    """Folha: grão, fibra, pauta clarinha, margem vermelha e vinheta."""
    base = Image.new("RGB", (W, H), (244, 236, 219))
    grao = Image.effect_noise((W, H), 22).convert("RGB")
    base = Image.blend(base, ImageChops.multiply(base, grao.point(lambda v: 200 + v // 5)), 0.55)
    fibra = Image.effect_noise((W // 6, H // 6), 40).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))
    base = Image.blend(base, ImageChops.multiply(base, fibra.convert("RGB").point(lambda v: 215 + v // 6)), 0.5)
    d = ImageDraw.Draw(base, "RGBA")
    for y in range(260, H - 120, 74):                       # pauta bem clarinha
        d.line([(0, y), (W, y)], fill=(120, 150, 190, 38), width=2)
    d.line([(118, 0), (118, H)], fill=(200, 80, 70, 60), width=3)   # margem
    vin = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vin).ellipse([-W * 0.25, -H * 0.15, W * 1.25, H * 1.15], fill=255)
    vin = vin.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(base, Image.new("RGB", (W, H), (205, 192, 168)), vin)


# ---------------------------------------------------------------- traço à mão
def tremido(pts, semente, amp=2.2, passo=10):
    """Polilinha com tremor de mão (e 'boil': muda a cada 4 quadros)."""
    rnd = random.Random(semente)
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / passo))
        for i in range(n):
            f = i / n
            out.append((x0 + (x1 - x0) * f + rnd.uniform(-amp, amp), y0 + (y1 - y0) * f + rnd.uniform(-amp, amp)))
    out.append((pts[-1][0] + rnd.uniform(-amp, amp), pts[-1][1] + rnd.uniform(-amp, amp)))
    return out


def parcial(pts, frac):
    """Os primeiros `frac` do comprimento (o lápis ainda está desenhando)."""
    if frac <= 0:
        return []
    seg = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
    alvo, acc = sum(seg) * min(frac, 1), 0.0
    out = [pts[0]]
    for (a, b), L in zip(zip(pts, pts[1:]), seg):
        if acc + L >= alvo:
            f = (alvo - acc) / L if L else 0
            out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            return out
        out.append(b)
        acc += L
    return out


def traco(d, pts, frac, semente, boil, cor=GRAFITE, larg=7, amp=2.2):
    p = parcial(tremido(pts, semente * 100 + boil, amp), frac)
    if len(p) > 1:
        sp = [(x * S, y * S) for x, y in p]
        d.line(sp, fill=cor + (235,), width=max(1, int(larg * S)), joint="curve")
        d.line([(x + 2, y + 1) for x, y in sp], fill=cor + (70,), width=max(2, int(larg * S // 3)))   # 2ª passada do lápis
        if frac < 1:   # ponta do lápis
            x, y = sp[-1]
            r = larg * S * 0.7
            d.ellipse([x - r, y - r, x + r, y + r], fill=cor + (255,))


def circulo(cx, cy, r, n=40, voltas=1.08):
    return [(cx + r * math.cos(-math.pi / 2 + 2 * math.pi * voltas * i / n) * (1 + 0.03 * math.sin(i)),
             cy + r * math.sin(-math.pi / 2 + 2 * math.pi * voltas * i / n)) for i in range(n + 1)]


def boneco(d, x, y, t0, t, semente, boil, braco=None, escala=1.0):
    """Boneco palito com os pés em (x, y). braco: ponto pra onde o braço aponta."""
    e = escala
    cab = (x, y - 230 * e)
    partes = [
        circulo(cab[0], cab[1], 38 * e, 30),
        [(x, y - 192 * e), (x, y - 95 * e)],
        [(x, y - 95 * e), (x - 34 * e, y)],
        [(x, y - 95 * e), (x + 34 * e, y)],
        [(x, y - 165 * e), braco or (x - 50 * e, y - 120 * e)],
        [(x, y - 165 * e), (x + 50 * e, y - 125 * e)],
    ]
    for i, pts in enumerate(partes):
        traco(d, pts, prog(t, t0 + i * 0.12, t0 + i * 0.12 + 0.35), semente + i, boil, larg=8)


def texto(base, t, a, b, frase, xy, tam, cor=GRAFITE, ang=0.0):
    """Escrita à mão: a frase aparece da esquerda pra direita (o 'pincel' anda)."""
    f = prog(t, a, b)
    if f <= 0:
        return
    fonte = ImageFont.truetype(FONTE, int(tam * S), index=1)
    l, top, r, bot = fonte.getbbox(frase)
    cam = Image.new("L", (r + 40, bot + 40), 0)
    ImageDraw.Draw(cam).text((20, 20), frase, font=fonte, fill=255)
    corte = int((r + 40) * f)
    mask = Image.new("L", cam.size, 0)
    mask.paste(cam.crop((0, 0, corte, cam.size[1])), (0, 0))
    if ang:
        mask = mask.rotate(ang, expand=True, resample=Image.BICUBIC)
    tinta = Image.new("RGBA", mask.size, cor + (0,))
    tinta.putalpha(mask.point(lambda v: v * 0.93))
    base.alpha_composite(tinta, (int(xy[0] * S), int(xy[1] * S)))


def marcatexto(d, t, a, b, x0, x1, y, semente, boil):
    pts = tremido([(x0, y), (x1, y + 4)], semente * 10 + boil // 2, amp=3, passo=30)
    p = parcial(pts, prog(t, a, b))
    if len(p) > 1:
        d.line([(x * S, y_ * S) for x, y_ in p], fill=AMARELO + (150,), width=int(46 * S))




# ---------------------------------------------------------------- tela dividida
def carregar_cenas(pasta):
    """CENAS e FIM do <pasta>/papel_cenas.py (tempos no BRUTO)."""
    sys.path.insert(0, str(Path(__file__).parent))
    spec = importlib.util.spec_from_file_location(f"papel_cenas_{abs(hash(str(pasta)))}", Path(pasta) / "papel_cenas.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return sorted(m.CENAS, key=lambda c: c[0]), getattr(m, "FIM", None)


def _fundo(W, METADE, FADE, k):
    """Papel da metade de cima (k = escala do desenho); nos últimos FADE px some por cima do vídeo."""
    p = papel(int(W * k), int(W * k * 16 / 9)).crop((0, 0, int(W * k), int(METADE * k))).convert("RGBA")
    alfa = Image.new("L", p.size, 255)
    d = ImageDraw.Draw(alfa)
    for y in range(int(FADE * k)):
        d.line([(0, int((METADE - FADE) * k) + y), (p.size[0], int((METADE - FADE) * k) + y)],
               fill=int(255 * (1 - y / (FADE * k)) ** 1.4))
    p.putalpha(alfa)
    return p


def _desenho(tam, f, u, quadro_n):
    letras = Image.new("RGBA", tam, (0, 0, 0, 0))
    camada = Image.new("RGBA", tam, (0, 0, 0, 0))
    f(letras, ImageDraw.Draw(camada, "RGBA"), u, quadro_n // 4)
    camada.alpha_composite(letras)
    return camada


def compor(pasta, entrada, saida, para_final, duracao, largura):
    """entrada (vídeo editado, 9:16) → saida em tela dividida. para_final(t_bruto)
    converte o tempo do bruto pro do vídeo editado (ou None se foi cortado)."""
    global S
    W, H = largura, largura * 16 // 9
    METADE, FADE = H // 2, int(H * 0.117)
    k = 1440 / W if W >= 1000 else 1080 / W          # desenha maior e reduz (traço liso)
    esc = W / PW
    S = esc * k
    off = (0, int((METADE - FADE - PH * esc) / 2 * k))
    cenas, fim = carregar_cenas(pasta)
    lista = sorted((para_final(a), f) for a, f in cenas if para_final(a) is not None)
    fim_div = (para_final(fim) if fim else None) or duracao
    blocos = [(a, (lista[i + 1][0] if i + 1 < len(lista) else fim_div), f) for i, (a, f) in enumerate(lista) if a < fim_div]
    fundo = _fundo(W, METADE, FADE, k)
    tam = fundo.size
    filtro = (f"[0:v]split[cheio][v];[v]crop={W}:{H - METADE + FADE}:0:0,pad={W}:{H}:0:{METADE - FADE}:color=black[baixo];"
              f"[1:v]format=rgba[papel];[baixo][papel]overlay=0:0:eof_action=pass,format=rgba,"
              f"fade=t=out:st={max(0.0, fim_div - 0.5):.2f}:d=0.5:alpha=1[div];[cheio][div]overlay=0:0[out]")
    temp = Path(saida).with_suffix(".papel.tmp.mp4")
    p = subprocess.Popen([str(Path.home() / ".infopro-hub/creator-bin/ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                          "-i", str(entrada), "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{METADE}", "-r", str(FPS), "-i", "-",
                          "-filter_complex", filtro, "-map", "[out]", "-map", "0:a?", "-c:v", "libx264",
                          "-preset", "medium" if W >= 1000 else "veryfast", "-crf", "20" if W >= 1000 else "26",
                          "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(temp)], stdin=subprocess.PIPE)
    vazio = None
    for n in range(int(duracao * FPS) + 1):
        t = n / FPS
        if t >= fim_div + 0.1:
            vazio = vazio or bytes(W * METADE * 4)
            p.stdin.write(vazio)
            continue
        img = fundo.copy()
        i = next((j for j, b in enumerate(blocos) if b[0] <= t < b[1]), None)
        if i is not None:
            a, z, f = blocos[i]
            u = t - a
            if u < 0.4 and i > 0:                  # a anterior some enquanto a nova começa
                pa, pz, pf = blocos[i - 1]
                velha = _desenho(tam, pf, pz - pa + 30, n)
                velha.putalpha(velha.getchannel("A").point(lambda v: int(v * (1 - u / 0.4))))
                img.alpha_composite(velha, off)
            img.alpha_composite(_desenho(tam, f, u, n), off)
        p.stdin.write(img.resize((W, METADE), Image.LANCZOS).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError("ffmpeg falhou ao compor o papel")
    temp.replace(saida)


def contato(pasta):
    """Folha de contato das cenas (no meio de cada uma), pra conferir o desenho."""
    global S
    W = 540
    METADE, FADE = 480, 112
    k = 1080 / W
    esc = W / PW
    S = esc * k
    cenas, _ = carregar_cenas(pasta)
    fundo = _fundo(W, METADE, FADE, k)
    off = (0, int((METADE - FADE - PH * esc) / 2 * k))
    ims = []
    for i, (a, f) in enumerate(cenas):
        prox = cenas[i + 1][0] if i + 1 < len(cenas) else a + 12
        img = fundo.copy()
        img.alpha_composite(_desenho(fundo.size, f, (prox - a) * 0.9, int(a * FPS)), off)
        ims.append(img.resize((W, METADE)).convert("RGB"))
    col = 3
    folha = Image.new("RGB", (W * col, METADE * ((len(ims) + col - 1) // col)), "white")
    for i, im in enumerate(ims):
        folha.paste(im, ((i % col) * W, (i // col) * METADE))
    destino = Path(pasta) / "_papel_contato.jpg"
    folha.save(destino, quality=85)
    return destino


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    import papel as _modulo          # as cenas fazem "from papel import *": usa o mesmo módulo
    if len(sys.argv) >= 3 and sys.argv[1] == "contato":
        print(_modulo.contato(sys.argv[2]))
    else:
        print(__doc__)
