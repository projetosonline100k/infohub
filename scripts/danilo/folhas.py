"""Folhas arrancadas do Instalivros (pedido do Davi em 21/10/2026): nos trechos
que não são livro, a metade de cima da tela dividida vira uma folha de caderno
clara com desenho à mão animado ligado à fala (as primitivas do papel.py, como
nos darks do Eu.davi). Cada cena é uma folha; na troca, a folha velha é
arrancada pra cima e a nova já está embaixo.
No fim de cada bloco (volta pra tela cheia) a última folha fica: desde 22/10 (v10)
quem cobre a troca é o overlay de papel do transicao.py (o Davi não gostou da folha
arrancada com a metade de baixo descendo). A escrita da última folha termina SAIDA s
antes do fim do bloco, antes do overlay subir.
22/10: a folha ocupa a metade de cima inteira e é RASGADA na linha do meio, com
um degradê escuro descendo por cima do vídeo dele (vídeo com transparência,
ProRes 4444, 1080x1100). A escrita é rápida e sempre termina antes da troca de
folha (antes, palavras saíam pela metade quando a folha era arrancada).

Cenas de cada edição: <pasta>/folhas_cenas.py
    from folhas import *           # tudo do papel.py + T() e os desenhos daqui (balao, coracao, livro…)
    BLOCOS = [(ini, fim, [(t, cena), …]), …]   # tempos no BRUTO; cada bloco vira um vídeo 1080x960
FUNDO = "preto" (opcional, Eu.davi 26/10): quadro preto rasgado e traço de giz (papel.GIZ), como o dark.
  Com ele, o quadro é o mesmo o bloco todo e a troca de cena é o quadro sendo limpo: uma varredura de
  borda macia (APAGA), sem apagador na tela e sem som, deixando um pó de giz que some (PO); o giz novo
  só aparece onde já está limpo.
A folha tem 940 x 835 unidades (x pra direita, y pra baixo); desenhe em y < 760
(embaixo fica a legenda, na linha do meio da tela). Dentro da cena, u = segundos
desde o começo dela e T(t_bruto) = o mesmo instante da fala em segundos da cena.

    python3 folhas.py contato <pasta>        → <pasta>/_folhas_contato.jpg (cada cena perto do fim)
    python3 folhas.py render <pasta>         → <pasta>/midias/folhas-<n>.mov (+ _alfa/ pro editor) + as mídias pro projeto.json
    python3 folhas.py aplicar <pasta>        → render + o padrão do IMG_2106 no projeto.json (tela dividida, clique, legenda na divisão)
"""
import importlib.util
import json
import math
import random
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from papel import *  # noqa: E402,F401,F403
import papel as _pp  # noqa: E402  (depois do *: o papel.py tem a função papel())
from papel import GRAFITE, VERMELHO, circulo, prog, suave, traco, tremido  # noqa: E402

FF = str(Path.home() / ".infopro-hub/creator-bin/ffmpeg")
W, H = 1080, 1100                     # metade de cima da tela + o rasgo e o degradê por cima do vídeo
CORTE = 960                           # linha do meio: onde a folha é rasgada
DEGRADE = 140                         # altura do degradê escuro embaixo do rasgo
UW = 940                              # largura em unidades de desenho
SS = 1.5                              # desenha maior e reduz (traço liso)
TROCA = 0.55                          # segundos da folha sendo arrancada
SAIDA = 0.6                           # a escrita da última folha do bloco termina antes disso (o overlay cobre o fim)
APAGA = 0.7                           # FUNDO preto (26/10): segundos da varredura que limpa o quadro na troca de cena
PO = 0.45                             # depois de limpar, o pó de giz some nesse tempo
LIMPA_BORDA = 260                     # largura (unidades) da borda macia da varredura
_mapa = None
_base = 0.0                           # tempo final em que a cena atual começa
_fim = 1e9                            # segundos (da cena) em que a folha atual é arrancada
_fundo = None                         # FUNDO = "preto" no folhas_cenas.py: quadro preto com giz (Eu.davi, 26/10)


def texto(base, t, a, b, frase, xy, tam, cor=GRAFITE, ang=0.0):
    """Escrita à mão rápida (no máx. ~0,4 s + 0,03 s por letra) que termina antes da folha ser
    arrancada: a frase fica inteira na tela, nunca cortada pela troca."""
    dur = min(b - a, 0.4 + 0.03 * len(frase))
    a = max(0.0, min(a, _fim - 0.8 - dur))
    _pp.texto(base, t, a, a + dur, frase, xy, tam, cor, ang)


def grifar(d, u, a, b, frase, xy, tam, sem, k):
    """Marca-texto que cobre a palavra INTEIRA (26/10: no FOCO o grifado pegava só a metade de baixo):
    altura e posição pelo desenho real das letras (getbbox), com a mesma folga de 20 px do texto()."""
    from PIL import ImageFont
    l, t, r, bt = ImageFont.truetype(_pp.FONTE, int(tam * _pp.S), index=1).getbbox(frase)
    x0, x1 = xy[0] + (20 + l) / _pp.S - 12, xy[0] + (20 + r) / _pp.S + 12
    y0, y1 = xy[1] + (20 + t) / _pp.S, xy[1] + (20 + bt) / _pp.S
    _pp.marcatexto(d, u, a, b, x0, x1, (y0 + y1) / 2, sem, k, larg=(y1 - y0) * 1.15)


def T(tb):
    """Tempo do bruto → segundos desde o começo da cena atual."""
    tf = _mapa.para_final(tb, "inicio") if _mapa else tb
    return (tf if tf is not None else 1e9) - _base


# ---------------------------------------------------------------- desenhos prontos
def linha(d, u, a, b, pts, sem, k, cor=GRAFITE, larg=7):
    traco(d, pts, prog(u, a, b), sem, k, cor=cor, larg=larg)


def retangulo(d, u, a, b, x0, y0, x1, y1, sem, k, cor=GRAFITE, larg=7):
    traco(d, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0 - 3)], prog(u, a, b), sem, k, cor=cor, larg=larg)


def coracao(d, u, a, b, cx, cy, r, sem, k, cor=VERMELHO, larg=8):
    pts = [(cx + r * 16 * math.sin(s) ** 3 / 16,
            cy - r * (13 * math.cos(s) - 5 * math.cos(2 * s) - 2 * math.cos(3 * s) - math.cos(4 * s)) / 16)
           for s in (math.pi * i / 30 for i in range(61))]
    traco(d, pts, prog(u, a, b), sem, k, cor=cor, larg=larg)


def balao(d, u, a, b, x0, y0, x1, y1, ponta, sem, k, cor=GRAFITE, larg=7):
    """Balão de fala arredondado com o rabicho apontando pra `ponta`."""
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    ang = math.atan2(ponta[1] - cy, ponta[0] - cx)
    pts = []
    for i in range(49):
        s = ang + 0.25 + (2 * math.pi - 0.5) * i / 48
        pts.append((cx + rx * math.cos(s), cy + ry * math.sin(s)))
    pts = pts + [ponta, pts[0]]
    traco(d, pts, prog(u, a, b), sem, k, cor=cor, larg=larg)


def livro(d, u, a, b, cx, cy, e, sem, k, cor=GRAFITE):
    """Livro aberto visto de frente."""
    w, h = 120 * e, 80 * e
    esq = [(cx, cy + h * 0.15), (cx - w * 0.5, cy), (cx - w, cy + h * 0.1), (cx - w, cy - h), (cx - w * 0.5, cy - h * 1.1), (cx, cy - h * 0.95)]
    dir_ = [(cx, cy - h * 0.95), (cx + w * 0.5, cy - h * 1.1), (cx + w, cy - h), (cx + w, cy + h * 0.1), (cx + w * 0.5, cy), (cx, cy + h * 0.15)]
    traco(d, esq, prog(u, a, a + (b - a) * 0.45), sem, k, cor=cor)
    traco(d, dir_, prog(u, a + (b - a) * 0.4, a + (b - a) * 0.85), sem + 1, k, cor=cor)
    traco(d, [(cx, cy - h * 0.95), (cx, cy + h * 0.15)], prog(u, a + (b - a) * 0.8, b), sem + 2, k, cor=cor, larg=5)
    for j in range(3):
        y = cy - h * (0.75 - j * 0.22)
        traco(d, [(cx - w * 0.82, y), (cx - w * 0.2, y + 4)], prog(u, b, b + 0.3), sem + 3 + j, k, larg=4)
        traco(d, [(cx + w * 0.2, y + 4), (cx + w * 0.82, y)], prog(u, b, b + 0.3), sem + 6 + j, k, larg=4)


def relogio(d, u, a, b, cx, cy, r, sem, k, cor=GRAFITE):
    traco(d, circulo(cx, cy, r, 36, 1.04), prog(u, a, a + (b - a) * 0.7), sem, k, cor=cor)
    traco(d, [(cx, cy), (cx, cy - r * 0.7)], prog(u, a + (b - a) * 0.7, b), sem + 1, k, cor=cor, larg=6)
    traco(d, [(cx, cy), (cx + r * 0.5, cy + r * 0.2)], prog(u, a + (b - a) * 0.8, b), sem + 2, k, cor=cor, larg=6)


def celular(d, u, a, b, x0, y0, w, h, sem, k, cor=GRAFITE):
    retangulo(d, u, a, a + (b - a) * 0.7, x0, y0, x0 + w, y0 + h, sem, k, cor=cor)
    traco(d, [(x0 + w * 0.4, y0 + h - 18), (x0 + w * 0.6, y0 + h - 18)], prog(u, a + (b - a) * 0.7, b), sem + 1, k, cor=cor, larg=5)


def olho(d, u, a, b, cx, cy, r, sem, k, cor=GRAFITE):
    cima = [(cx - r + 2 * r * i / 24, cy - r * 0.55 * math.sin(math.pi * i / 24)) for i in range(25)]
    baixo = [(cx + r - 2 * r * i / 24, cy + r * 0.55 * math.sin(math.pi * i / 24)) for i in range(25)]
    traco(d, cima + baixo, prog(u, a, a + (b - a) * 0.6), sem, k, cor=cor)
    traco(d, circulo(cx, cy, r * 0.3, 24), prog(u, a + (b - a) * 0.6, b), sem + 1, k, cor=cor, larg=9)


def seta(d, u, a, b, x0, y0, x1, y1, sem, k, cor=GRAFITE, curva=0.0, larg=7):
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2 - curva
    pts = [((1 - s) ** 2 * x0 + 2 * (1 - s) * s * mx + s * s * x1, (1 - s) ** 2 * y0 + 2 * (1 - s) * s * my + s * s * y1)
           for s in (i / 20 for i in range(21))]
    traco(d, pts, prog(u, a, a + (b - a) * 0.8), sem, k, cor=cor, larg=larg)
    ang = math.atan2(y1 - pts[-3][1], x1 - pts[-3][0])
    for s in (-1, 1):
        traco(d, [(x1, y1), (x1 - 34 * math.cos(ang + s * 0.5), y1 - 34 * math.sin(ang + s * 0.5))],
              prog(u, a + (b - a) * 0.8, b), sem + 2 + s, k, cor=cor, larg=larg)


def xis(d, u, a, b, cx, cy, r, sem, k, cor=VERMELHO):
    traco(d, [(cx - r, cy - r), (cx + r, cy + r)], prog(u, a, (a + b) / 2), sem, k, cor=cor, larg=9)
    traco(d, [(cx + r, cy - r), (cx - r, cy + r)], prog(u, (a + b) / 2, b), sem + 1, k, cor=cor, larg=9)


# ---------------------------------------------------------------- a folha rasgada
def _rasgo(pts, rnd, amp):
    """Borda rasgada entre os cantos: serrilhado miúdo + ondas largas."""
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 7))
        fase = rnd.uniform(0, 6)
        for i in range(n):
            f = i / n
            nx, ny = -(y1 - y0), (x1 - x0)
            L = math.hypot(nx, ny) or 1
            desvio = amp * (0.55 * math.sin(f * 9 + fase) + rnd.uniform(-0.8, 0.8))
            out.append((x0 + (x1 - x0) * f + nx / L * desvio, y0 + (y1 - y0) * f + ny / L * desvio))
    return out


def folha(cw, ch, semente):
    """Folha de caderno clara (RGBA) que passa das bordas de cima e dos lados e é rasgada
    embaixo, na linha do meio: borda irregular com a fibra branca do rasgo e sombra curta."""
    rnd = random.Random(semente)
    corte, fora = CORTE * SS, 60 * SS
    # o rasgo: ondas largas e um serrilhado miúdo, da direita pra esquerda
    marcos = [(cw + fora, corte + rnd.uniform(-10, 10) * SS)]
    for j in range(1, 7):
        marcos.append((cw + fora - (cw + 2 * fora) * j / 7 + rnd.uniform(-30, 30) * SS, corte + rnd.uniform(-16, 16) * SS))
    marcos.append((-fora, corte + rnd.uniform(-10, 10) * SS))
    rasgo = _rasgo(marcos, rnd, 4.5 * SS)
    forma = [(-fora, -fora), (cw + fora, -fora)] + rasgo
    textura = (_pp.lousa if _fundo == "preto" else _pp.papel)(cw, int(cw * 16 / 9)).crop((0, 0, cw, ch)).convert("RGBA")
    img = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sombra = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(sombra).polygon([(x, y + 8 * SS) for x, y in forma], fill=170)
    img.paste((0, 0, 0, 255), (0, 0), sombra.filter(ImageFilter.GaussianBlur(7 * SS)))
    fibra = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(fibra).polygon(forma, fill=255)
    fibra = fibra.filter(ImageFilter.MaxFilter(7))
    img.paste((96, 94, 90, 255) if _fundo == "preto" else (252, 250, 245, 255), (0, 0), fibra)   # a borda do rasgo
    miolo = Image.new("L", (cw, ch), 0)
    rasgo2 = _rasgo([(x, y - 3 * SS) for x, y in marcos], random.Random(semente + 1), 3.0 * SS)
    ImageDraw.Draw(miolo).polygon([(-fora, -fora), (cw + fora, -fora)] + rasgo2, fill=255)
    img.paste(textura, (0, 0), miolo)
    return img


def _degrade(cw, ch):
    """Degradê escuro que desce do rasgo por cima do vídeo (fica parado; só a folha é arrancada)."""
    alfa = Image.new("L", (cw, ch), 0)
    d = ImageDraw.Draw(alfa)
    y0, alt = int((CORTE - 30) * SS), int(DEGRADE * SS)
    for y in range(y0, min(ch, y0 + alt)):
        f = (y - y0) / alt
        d.line([(0, y), (cw, y)], fill=int(175 * (1 - f) ** 1.6))
    img = Image.new("RGBA", (cw, ch), (12, 10, 9, 0))
    img.putalpha(alfa)
    return img


# ---------------------------------------------------------------- render
def carregar(pasta):
    global _fundo
    spec = importlib.util.spec_from_file_location(f"folhas_cenas_{abs(hash(str(pasta)))}", Path(pasta) / "folhas_cenas.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    _fundo = getattr(m, "FUNDO", None)
    _pp.PALETA = _pp.GIZ if _fundo == "preto" else {}
    return m.BLOCOS


def _mapa_de(pasta):
    import motor
    projeto = json.loads((Path(pasta) / "projeto.json").read_text())
    return motor.Mapa(motor.trechos_mantidos(projeto))


class Bloco:
    def __init__(self, ini, fim, cenas, n, saida=True, cheia=False):
        self.W, self.H = (W, 1920) if cheia else (W, H)
        self.cw, self.ch = int(self.W * SS), int(self.H * SS)
        self.a, self.b = _mapa.intervalo(ini, fim)
        self.saida = saida                 # False: o próximo bloco emenda nele (continua dividida)
        self.cenas = [(_mapa.para_final(t, "inicio") - self.a, f) for t, f in sorted(cenas, key=lambda c: c[0])]
        # quadro preto (26/10): o mesmo quadro o bloco todo e, na troca de cena, o giz é limpo
        self.apagar = _fundo == "preto"
        if cheia:                          # 22/10: a folha cobre a tela inteira (o final com a CTA), sem rasgo
            fundo = _pp.lousa if _fundo == "preto" else _pp.papel
            self.folhas = [fundo(self.cw, self.ch).convert("RGBA")] * len(self.cenas)
            self.fundo = Image.new("RGBA", (self.cw, self.ch), (0, 0, 0, 0))
        else:
            self.folhas = ([folha(self.cw, self.ch, 100 * n)] * len(self.cenas) if self.apagar
                           else [folha(self.cw, self.ch, 100 * n + i) for i in range(len(self.cenas))])
            self.fundo = _degrade(self.cw, self.ch)
        self.dur = self.b - self.a
        self._velha = {}

    def _camada(self, i, u, quadro):
        """Só o giz/tinta da cena i (sem a folha)."""
        global _base, _fim
        _base = self.a + self.cenas[i][0]
        _fim = (self.cenas[i + 1][0] if i + 1 < len(self.cenas) else self.dur - (SAIDA if self.saida else 0)) - self.cenas[i][0]
        letras = Image.new("RGBA", (self.cw, self.ch), (0, 0, 0, 0))
        camada = Image.new("RGBA", (self.cw, self.ch), (0, 0, 0, 0))
        self.cenas[i][1](letras, ImageDraw.Draw(camada, "RGBA"), u, quadro // 4)
        camada.alpha_composite(letras)
        return camada

    def _desenho(self, i, u, quadro):
        pag = self.folhas[i].copy()
        pag.alpha_composite(self._camada(i, u, quadro))
        return pag

    def _limpo(self, p):
        """Máscara do que já foi limpo (255) com o progresso p (0–1): uma faixa de borda macia e
        levemente inclinada varre o quadro da esquerda pra direita (26/10: o Davi quis só o efeito de
        limpar, sem o apagador aparecendo e sem som)."""
        s = self.cw / UW
        banda, incl = LIMPA_BORDA * s, 0.22
        larg = int(self.cw + banda + incl * self.ch) + 2
        frente = p * larg
        m = Image.new("L", (larg, self.ch), 0)
        if frente > banda:
            m.paste(255, (0, 0, int(frente - banda), self.ch))
        rampa = Image.linear_gradient("L").rotate(90, expand=True).resize((max(1, int(banda)), self.ch))  # 255 → 0
        m.paste(rampa, (int(frente - banda), 0))
        # inclina a frente (em cima vai um pouco à frente de embaixo) e recorta no quadro
        m = m.transform((self.cw, self.ch), Image.AFFINE, (1, incl, 0, 0, 1, 0), resample=Image.BILINEAR)
        return m

    def _troca_apagando(self, img, i, u, n):
        """Cena i acabou de começar: o giz da cena anterior some atrás da varredura que limpa o quadro,
        deixando um pó leve de giz que some; o giz novo aparece onde já está limpo. Sem apagador na tela."""
        if i not in self._velha:
            velha = self._camada(i - 1, self.cenas[i][0] - self.cenas[i - 1][0], n)
            fim_i = (self.cenas[i + 1][0] if i + 1 < len(self.cenas) else self.dur) - self.cenas[i][0]
            # o que a cena nova repete igual (ex.: o número e o título do hobby) não é apagado
            # (traço igual = em volta dele as duas camadas quase coincidem; traço que só cruza outro, não)
            a0, a1 = velha.getchannel("A"), self._camada(i, fim_i, n).getchannel("A")
            borra = ImageFilter.GaussianBlur(10 * SS)
            menor, maior = ImageChops.darker(a0, a1).filter(borra), ImageChops.lighter(a0, a1).filter(borra)
            comum = ImageChops.subtract(menor, maior.point(lambda a: int(a * 0.8))).point(lambda a: 255 if a > 2 else 0)
            comum = ImageChops.multiply(comum.filter(ImageFilter.MaxFilter(7)), a0.point(lambda a: 255 if a else 0))
            fica = velha.copy()
            fica.putalpha(ImageChops.multiply(velha.getchannel("A"), comum))
            velha.putalpha(ImageChops.multiply(velha.getchannel("A"), ImageChops.invert(comum)))
            self._velha[i] = (velha, velha.filter(ImageFilter.GaussianBlur(9 * SS)), fica)
        velha, borrao, fica = self._velha[i]
        img.alpha_composite(fica)
        limpo = self._limpo(suave(min(1.0, u / APAGA)))
        resto = 0.28 * (1 - suave((u - APAGA) / PO))     # o pó de giz que fica onde limpou
        if resto > 0:
            b = borrao.copy()
            b.putalpha(ImageChops.multiply(borrao.getchannel("A"), limpo).point(lambda a: int(a * resto)))
            img.alpha_composite(b)
        nova = self._camada(i, max(0.0, u), n)            # o giz novo só aparece onde já está limpo
        if u < APAGA:
            nova.putalpha(ImageChops.multiply(nova.getchannel("A"), limpo))
            v = velha.copy()
            v.putalpha(ImageChops.multiply(velha.getchannel("A"), ImageChops.invert(limpo)))
            img.alpha_composite(v)
        img.alpha_composite(nova)

    def quadro(self, t, n):
        i = max([j for j, (c, _) in enumerate(self.cenas) if c <= t] or [0])
        u = t - self.cenas[i][0]
        img = self.fundo.copy()
        if self.apagar and i > 0 and u < APAGA + PO:
            img.alpha_composite(self.folhas[i])
            self._troca_apagando(img, i, u, n)
            return img.resize((self.W, self.H), Image.LANCZOS)
        img.alpha_composite(self._desenho(i, max(0.0, u), n))
        if not self.apagar and i > 0 and u < TROCA:                      # a folha anterior sendo arrancada pra cima
            if i not in self._velha:
                self._velha[i] = self._desenho(i - 1, self.cenas[i][0] - self.cenas[i - 1][0], n)
            p = suave(u / TROCA)
            velha = self._velha[i].rotate(-14 * p, resample=Image.BICUBIC, center=(self.cw, 0))
            img.alpha_composite(velha, (int(90 * SS * p), -int(self.ch * 1.15 * p ** 1.3)))
        return img.resize((self.W, self.H), Image.LANCZOS)


def _preparar(pasta):
    global _mapa
    _pp.S = W * SS / UW
    _mapa = _mapa_de(pasta)
    blocos = carregar(pasta)
    inicios = {round(b[0], 2) for b in blocos}
    return [Bloco(b[0], b[1], b[2], n, saida=round(b[1], 2) not in inicios, cheia="cheia" in b[3:])
            for n, b in enumerate(blocos)]


def _render_um(pasta, n):
    """Um bloco num processo só dele: T() usa globais (_mapa, _base, _fim) e, em threads, um bloco
    mexia no tempo do outro (22/10: o escudo da promessa piscava pronto no começo da folha)."""
    import folhas as _m   # mesmo módulo que as cenas importam
    bl = _m._preparar(pasta)[n]
    saida = Path(pasta) / "midias" / f"folhas-{n + 1}.mov"
    p = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                          "-s", f"{bl.W}x{bl.H}", "-r", str(_pp.FPS), "-i", "-", "-c:v", "prores_ks", "-profile:v", "4444",
                          "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", str(saida)], stdin=subprocess.PIPE)
    for q in range(int((bl.dur + 0.5) * _pp.FPS)):
        p.stdin.write(bl.quadro(q / _pp.FPS, q).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg falhou na folha {n + 1}")
    _copia_editor(saida)
    return str(saida)


def render(pasta, so=None):
    from concurrent.futures import ProcessPoolExecutor
    pasta = Path(pasta)
    (pasta / "midias").mkdir(exist_ok=True)
    blocos = carregar(pasta)
    nums = [n for n in range(len(blocos)) if so is None or n + 1 in so]
    with ProcessPoolExecutor(3) as ex:
        list(ex.map(_render_um, [str(pasta)] * len(nums), nums))
    midias = [{"id": f"folhas-{n + 1}", "tipo": "video", "alfa": True, "arquivo": str(pasta / "midias" / f"folhas-{n + 1}.mov"),
               "inicio": b[0], "fim": b[1], "x": 0, "y": 0, "w": W, "h": 1920 if "cheia" in b[3:] else H, "raio": 0}
              for n, b in enumerate(blocos)]
    return midias


def _copia_editor(mov):
    """Cópia leve com transparência pro mini editor (WebKit só toca HEVC com alfa feito pelo
    encoder da Apple): <midias>/_alfa/<nome>.mov, igual ao motor.video_alfa."""
    destino = mov.parent / "_alfa" / mov.name
    destino.parent.mkdir(exist_ok=True)
    leve = destino.with_name(f"{mov.stem}.prores.mov")
    try:
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(mov), "-vf", "scale=540:-2",
                        "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", str(leve)], check=True)
        if shutil.which("avconvert"):
            subprocess.run(["avconvert", "-s", str(leve), "-o", str(destino), "-p", "PresetHEVCHighestQualityWithAlpha", "--replace"],
                           check=True, capture_output=True)
        else:   # servidor Linux (17/11): sem o encoder da Apple, o editor usa o ProRes leve; servidor.empilhado() faz dele o mp4 que a web toca
            leve.replace(destino)
    finally:
        leve.unlink(missing_ok=True)


def contato(pasta):
    blocos = _preparar(pasta)
    ims = []
    for bl in blocos:
        for i, (c, _) in enumerate(bl.cenas):
            fim = bl.cenas[i + 1][0] if i + 1 < len(bl.cenas) else bl.dur
            fundo = Image.new("RGBA", (bl.W, bl.H), (90, 110, 130, 255))   # o vídeo dele embaixo
            fundo.alpha_composite(bl.quadro(c + (fim - c) * 0.92, 0))
            fundo.thumbnail((540, 550))
            caixa = Image.new("RGB", (540, 550), "white")
            caixa.paste(fundo.convert("RGB"), ((540 - fundo.size[0]) // 2, 0))
            ims.append(caixa)
    col = 3
    grade = Image.new("RGB", (540 * col, 550 * ((len(ims) + col - 1) // col)), "white")
    for i, im in enumerate(ims):
        grade.paste(im, ((i % col) * 540, (i // col) * 550))
    destino = Path(pasta) / "_folhas_contato.jpg"
    grade.save(destino, quality=85)
    return destino


def aplicar(pasta):
    """Padrão do piloto IMG_2106 aprovado (Eu.davi, 26/10) no projeto.json: desenha os blocos e põe as
    folhas por baixo das outras mídias (GIFs), a tela dividida = os blocos, sem zoom nesses trechos,
    a faixa dele do topo do quadro, legenda/headline na linha da divisão, destaque embaixo e o
    clique na entrada de cada trecho dividido (corte seco, sem rasgo na saída)."""
    import motor
    import transicao
    pasta = Path(pasta)
    midias_f = render(pasta)
    blocos = carregar(pasta)
    proj = json.loads((pasta / "projeto.json").read_text())
    proj["midias"] = midias_f + [m for m in proj.get("midias", []) if not m["id"].startswith(("folhas-", "rasgo-", "transicao-"))]
    tds = [{"inicio": b[0], "fim": b[1]} for b in blocos if "cheia" not in b[3:]]
    proj["tela_dividida"] = tds
    proj["formato"] = "classico"
    proj.update(recorte_dividida=0.0, legenda_dividida=960, destaque_y=1760)
    proj["zooms"] = [z for z in proj.get("zooms", []) if all(z["fim"] <= t["inicio"] or z["inicio"] >= t["fim"] for t in tds)]
    proj["zoom"] = []
    mapa = motor.Mapa(motor.trechos_mantidos(proj))
    ivs = sorted(iv for iv in (mapa.intervalo(t["inicio"], t["fim"]) for t in tds) if iv)
    entradas = [a for i, (a, b) in enumerate(ivs) if a > 0.3 and not (i and abs(ivs[i - 1][1] - a) < 0.05)]
    if not transicao.SOM_CLIQUE.exists():
        transicao.gerar_clique()
    clique = pasta / "midias" / transicao.SOM_CLIQUE.name
    clique.write_bytes(transicao.SOM_CLIQUE.read_bytes())
    efeitos = [e for e in proj.get("efeitos", []) if not e["id"].startswith(("sobe-", "rasgo-", "clique-", "folha-", "apagador-"))]
    efeitos += [{"id": f"clique-{n}", "arquivo": str(clique), "volume": 0.5,
                 "inicio": round(motor.para_bruto(mapa.segs, tf), 3)} for n, tf in enumerate(entradas, 1)]
    proj["efeitos"] = sorted(efeitos, key=lambda e: e["inicio"])
    (pasta / "projeto.json").write_text(json.dumps(proj, ensure_ascii=False, indent=1))
    return {"blocos": len(midias_f), "tela_dividida": len(tds), "cliques": len(entradas), "zooms": len(proj["zooms"])}


if __name__ == "__main__":
    import folhas as _m   # as cenas fazem "from folhas import *": usa o mesmo módulo
    if len(sys.argv) >= 3 and sys.argv[1] == "contato":
        print(_m.contato(sys.argv[2]))
    elif len(sys.argv) >= 3 and sys.argv[1] == "render":
        so = {int(x) for x in sys.argv[3:]} or None
        print(json.dumps(_m.render(sys.argv[2], so), ensure_ascii=False, indent=1))
    elif len(sys.argv) >= 3 and sys.argv[1] == "aplicar":
        print(json.dumps(_m.aplicar(sys.argv[2]), ensure_ascii=False))
    else:
        print(__doc__)
