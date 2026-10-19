"""Formato 'dark' do Danilo (teste pedido pelo Davi em 19/10/2026): o Davi não
aparece, fica só a voz dele, e a tela inteira é o papel desenhado à mão
(mesmas primitivas do papel.py) acompanhando a fala. Headline amarela na
abertura, legendas amarelas, INSTALIVROS em caixa amarela e música clássica baixa.

Pasta da edição (<pasta>):
    voz.wav            voz do Davi (no reel postado, separada da música com demucs)
    legendas.json      [{"ini", "fim", "texto"}] no tempo da voz
    dark_cenas.py      from papel import *;  HEADLINE = (texto, fim);  DESTAQUE = (texto, ini) ou None;
                       CENAS = [(início, função)]  — tela 940 x 1671 unidades (x pra direita, y pra baixo).
                       Deixe livre: em cima (y < 450) enquanto a headline está na tela; embaixo (y > 1180) é das legendas.

    python3 dark.py contato <pasta>                → <pasta>/_dark_contato.jpg (cenas perto do fim de cada uma)
    python3 dark.py render <pasta> [--previa] [--musica gymnopedie-1.ogg]  → <pasta>/dark[-previa].mp4
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import papel  # noqa: E402  (as cenas fazem "from papel import *": é o mesmo módulo)

FF = str(Path.home() / ".infopro-hub/creator-bin/ffmpeg")
ACERVO = Path.home() / ".infopro-hub/danilo/acervo"
ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
AMARELO = (255, 214, 10)
ESCURO = (16, 16, 16)
UW = 940                                 # largura da tela em unidades de desenho
FPS = 30


def carregar(pasta):
    spec = importlib.util.spec_from_file_location(f"dark_cenas_{abs(hash(str(pasta)))}", Path(pasta) / "dark_cenas.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return sorted(m.CENAS, key=lambda c: c[0]), getattr(m, "HEADLINE", None), getattr(m, "DESTAQUE", None)


def _quebrar(texto, fonte, largura):
    linhas, atual = [], ""
    for p in texto.split():
        teste = f"{atual} {p}".strip()
        if atual and fonte.getlength(teste) > largura:
            linhas.append(atual)
            atual = p
        else:
            atual = teste
    return linhas + ([atual] if atual else [])


def _texto_amarelo(W, texto, tam, largura, entrelinhas=1.3):
    """Bloco centralizado, amarelo com contorno escuro (o das legendas do Davi)."""
    f = ImageFont.truetype(ARIAL, tam)
    linhas = _quebrar(texto, f, largura)
    borda = max(3, tam // 14)
    alt = int(tam * entrelinhas)
    img = Image.new("RGBA", (W, alt * len(linhas) + borda * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(linhas):
        x = (W - f.getlength(l)) / 2
        y = borda * 2 + i * alt
        d.text((x + 3, y + 4), l, font=f, fill=(0, 0, 0, 110), stroke_width=borda, stroke_fill=(0, 0, 0, 110))
        d.text((x, y), l, font=f, fill=AMARELO, stroke_width=borda, stroke_fill=ESCURO)
    return img


def _caixa(texto, tam):
    f = ImageFont.truetype(ARIAL, tam)
    l, t, r, b = f.getbbox(texto)
    pad = tam // 3
    img = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=tam // 4, fill=AMARELO + (255,))
    d.text((pad - l, pad - t), texto, font=f, fill=ESCURO)
    return img


class Tela:
    def __init__(self, pasta, W):
        self.pasta = Path(pasta)
        self.W, self.H = W, W * 16 // 9
        self.k = 1440 / W if W >= 1000 else 1080 / W              # desenha maior e reduz (traço liso)
        papel.S = W / UW * self.k
        self.tam = (int(self.W * self.k), int(self.H * self.k))
        self.fundo = papel.papel(*self.tam).convert("RGBA")
        self.cenas, self.headline, self.destaque = carregar(pasta)
        leg = self.pasta / "legendas.json"
        self.legendas = json.loads(leg.read_text()) if leg.exists() else []
        e = W / 1080
        self.head_img = _texto_amarelo(W, self.headline[0], int(70 * e), int(930 * e)) if self.headline else None
        self.dest_img = _caixa(self.destaque[0], int(64 * e)) if self.destaque else None
        self._cache = {}
        self.e = e

    def _desenho(self, f, u, n):
        letras = Image.new("RGBA", self.tam, (0, 0, 0, 0))
        camada = Image.new("RGBA", self.tam, (0, 0, 0, 0))
        f(letras, ImageDraw.Draw(camada, "RGBA"), u, n // 4)
        camada.alpha_composite(letras)
        return camada

    def blocos(self, duracao):
        c = self.cenas
        return [(a, c[i + 1][0] if i + 1 < len(c) else duracao, f) for i, (a, f) in enumerate(c)]

    def quadro(self, t, n, blocos, com_texto=True):
        img = self.fundo.copy()
        i = next((j for j, b in enumerate(blocos) if b[0] <= t < b[1]), None)
        if i is not None:
            a, z, f = blocos[i]
            u = t - a
            if u < 0.4 and i > 0:                     # a anterior some enquanto a nova começa
                pa, pz, pf = blocos[i - 1]
                velha = self._desenho(pf, pz - pa + 30, n)
                velha.putalpha(velha.getchannel("A").point(lambda v: int(v * (1 - u / 0.4))))
                img.alpha_composite(velha)
            img.alpha_composite(self._desenho(f, u, n))
        img = img.resize((self.W, self.H), Image.LANCZOS)
        if not com_texto:
            return img
        e = self.e
        if self.head_img and t < self.headline[1]:
            alfa = min(1.0, (self.headline[1] - t) / 0.3)
            h = self.head_img if alfa >= 1 else _com_alfa(self.head_img, alfa)
            img.alpha_composite(h, (0, int(150 * e)))
        if self.dest_img and t >= self.destaque[1]:
            img.alpha_composite(self.dest_img, ((self.W - self.dest_img.size[0]) // 2, int(250 * e)))
        leg = next((l for l in self.legendas if l["ini"] <= t < l["fim"]), None)
        if leg:
            chave = leg["texto"]
            if chave not in self._cache:
                self._cache[chave] = _texto_amarelo(self.W, chave, int(66 * e), int(900 * e), 1.2)
            li = self._cache[chave]
            img.alpha_composite(li, (0, int(1420 * e) - li.size[1] // 2))
        return img


def _com_alfa(img, a):
    c = img.copy()
    c.putalpha(c.getchannel("A").point(lambda v: int(v * a)))
    return c


def duracao(arq):
    r = subprocess.run([FF, "-hide_banner", "-i", str(arq)], capture_output=True, text=True).stderr
    h, m, s = r.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def render(pasta, previa=False, musica="gymnopedie-1.ogg"):
    pasta = Path(pasta)
    W = 540 if previa else 1080
    tela = Tela(pasta, W)
    voz = pasta / "voz.wav"
    dur = duracao(voz)
    blocos = tela.blocos(dur)
    saida = pasta / ("dark-previa.mp4" if previa else "dark.mp4")
    # voz na frente; música baixa que abaixa sozinha quando o Davi fala, com saída suave
    filtro = (f"[0:a]aformat=channel_layouts=stereo,highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=9,asplit=2[voz][sc];"
              f"[2:a]aformat=channel_layouts=stereo,volume=0.16,atrim=0:{dur:.2f},"
              f"afade=t=in:d=1.2,afade=t=out:st={dur - 2.0:.2f}:d=2.0[mus];"
              f"[mus][sc]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=500[musb];"
              f"[voz][musb]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,aresample=48000[a]")
    p = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-y",
                          "-i", str(voz),
                          "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{tela.H}", "-r", str(FPS), "-i", "-",
                          "-stream_loop", "-1", "-i", str(ACERVO / musica),
                          "-filter_complex", filtro, "-map", "1:v", "-map", "[a]",
                          "-c:v", "libx264", "-preset", "medium" if not previa else "veryfast",
                          "-crf", "18" if not previa else "26", "-pix_fmt", "yuv420p",
                          "-c:a", "aac", "-b:a", "256k", "-t", f"{dur:.3f}", "-movflags", "+faststart", str(saida)],
                         stdin=subprocess.PIPE)
    total = int(dur * FPS) + 1
    for n in range(total):
        p.stdin.write(tela.quadro(n / FPS, n, blocos).tobytes())
        if n % 300 == 0:
            print(f"{n}/{total}", flush=True)
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError("ffmpeg falhou")
    return saida


def contato(pasta, tempos=None):
    """Folha com cada cena perto do fim (o desenho completo), com headline/legenda daquele instante."""
    pasta = Path(pasta)
    tela = Tela(pasta, 360)
    dur = duracao(pasta / "voz.wav") if (pasta / "voz.wav").exists() else tela.cenas[-1][0] + 10
    blocos = tela.blocos(dur)
    tempos = tempos or [a + (z - a) * 0.92 for a, z, _ in blocos]
    ims = [tela.quadro(t, int(t * FPS), blocos).convert("RGB") for t in tempos]
    col = min(5, len(ims))
    folha = Image.new("RGB", (tela.W * col + 6 * (col - 1), tela.H * ((len(ims) + col - 1) // col)), "white")
    for i, im in enumerate(ims):
        folha.paste(im, ((i % col) * (tela.W + 6), (i // col) * tela.H))
    destino = pasta / "_dark_contato.jpg"
    folha.save(destino, quality=88)
    return destino


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == "contato":
        print(contato(a[1], [float(x) for x in a[2:]] or None))
    elif len(a) >= 2 and a[0] == "render":
        mus = a[a.index("--musica") + 1] if "--musica" in a else "gymnopedie-1.ogg"
        print(render(a[1], "--previa" in a, mus))
    else:
        print(__doc__)
