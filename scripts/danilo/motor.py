"""Motor de edição do Danilo (editor IA do Eu.daviqueiroz).

Monta o MP4 a partir de um PROJETO de edição (projeto.json). Tudo no
projeto está no TEMPO DO BRUTO, então cortar ou restaurar um trecho não
desalinha legendas, imagens nem música: o motor recalcula na hora de montar.

projeto.json:
  fonte          caminho do bruto (cópia local)
  duracao_fonte  segundos do bruto
  remocoes       [{id, inicio, fim, origem: "auto"|"davi", motivo}]: trechos fora do vídeo
                 (restaurar = apagar da lista)
  lacunas        [{id, inicio, fim}]: trechos que ficam no tempo, mas em preto e mudo
                 (apagado no mini editor com "Juntar ao apagar" desligado)
  legendas       [{id, inicio, fim, texto, tipo: "head"|"leg"}]
  destaques      [{texto, inicio, fim?}]: palavra fixa na tela (ex.: INSTALIVROS da 1ª menção
                 até o último quadro; sem fim = até o fim do vídeo)
  midias         [{id, tipo: "imagem"|"video", arquivo, inicio, fim, x, y, w, h}]
  musica         {arquivo, volume} | null
  zooms          [{id, inicio, fim, z, tipo: "suave"|"seco"|"lento"}]: zoom como camada de ajuste
                 (projeto antigo: zoom [{t, z, d}] em pontos, convertido por blocos_zoom)
  cor            "cinema" | "natural" | "quente" | "frio" | "vibrante" | "pb"
  ajuste_cor     {exposicao, contraste, saturacao, temperatura} de -100 a 100 (estilo Lumetri)

Uso: python3 motor.py <pasta-do-projeto> [--previa]
  --previa: 720p e mais rápido, pra conferir no mini editor.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FF = os.path.expanduser("~/.infopro-hub/creator-bin/ffmpeg")
LARG, ALT, FPS = 1080, 1920, 30
FONTES = "/System/Library/Fonts/Supplemental"


# ---------------------------------------------------------------- tempo
def trechos_mantidos(projeto):
    """[0, duração] menos as remoções → lista de (início, fim) no bruto."""
    rem = sorted((r["inicio"], r["fim"]) for r in projeto["remocoes"])
    mant, pos = [], 0.0
    for a, b in rem:
        if a > pos:
            mant.append((pos, a))
        pos = max(pos, b)
    if pos < projeto["duracao_fonte"]:
        mant.append((pos, projeto["duracao_fonte"]))
    return [(a, b) for a, b in mant if b - a >= 0.05]


class Mapa:
    """Converte tempo do bruto ↔ tempo do vídeo final."""

    def __init__(self, segs):
        self.segs = segs
        self.duracao = sum(b - a for a, b in segs)

    def para_final(self, t, lado="inicio"):
        """lado="inicio": se t cai num corte, vai pro começo do trecho seguinte;
        lado="fim": vai pro fim do trecho anterior."""
        acc, anterior = 0.0, None
        for a, b in self.segs:
            if t < a:
                return acc if lado == "inicio" else anterior
            if t <= b:
                return acc + (t - a)
            acc += b - a
            anterior = acc
        return self.duracao if lado == "fim" else None

    def intervalo(self, a, b):
        s, e = self.para_final(a, "inicio"), self.para_final(b, "fim")
        if s is None or e is None or e - s < 0.15:
            return None
        return s, e


# ---------------------------------------------------------------- legendas
def ts(t):
    t = max(0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def gerar_ass(projeto, mapa, destino):
    ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {LARG}
PlayResY: {ALT}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Head,Arial,74,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,4.5,2,2,60,60,0,1
Style: Leg,Arial,58,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,3.6,1.5,5,60,60,0,1
Style: Dest,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,-1,0,0,0,100,100,2,0,1,5,2.5,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for l in sorted(projeto["legendas"], key=lambda l: l["inicio"]):
        iv = mapa.intervalo(l["inicio"], l["fim"])
        if not iv or not l["texto"].strip():
            continue
        texto = l["texto"].replace("\n", "\\N")
        if l.get("tipo") == "head":
            ass += f"Dialogue: 0,{ts(iv[0])},{ts(iv[1])},Head,,0,0,0,,{{\\an2\\pos(540,1110)\\fad(120,80)}}{texto}\n"
        else:
            ass += f"Dialogue: 0,{ts(iv[0])},{ts(iv[1])},Leg,,0,0,0,,{{\\an5\\pos(540,1080)}}{texto}\n"
    for d in projeto.get("destaques", []):
        a = mapa.para_final(d["inicio"], "inicio")
        b = mapa.para_final(d["fim"], "fim") if d.get("fim") else mapa.duracao
        if a is not None and b is not None and b - a > 0.15 and d.get("texto", "").strip():
            ass += f"Dialogue: 1,{ts(a)},{ts(b)},Dest,,0,0,0,,{{\\an5\\pos(540,1400)\\fad(150,0)}}{d['texto']}\n"
    Path(destino).write_text(ass, encoding="utf-8")


# ---------------------------------------------------------------- zoom
def blocos_zoom(projeto):
    """Zoom como camada de ajuste: [{id, inicio, fim, z, tipo: suave|seco|lento}] no tempo do bruto.
    Projeto antigo (só `zoom` em pontos {t, z, d}) vira blocos (igual ao mini editor)."""
    if projeto.get("zooms") is not None:
        return projeto["zooms"]
    out, aberto = [], None
    for k in sorted(projeto.get("zoom", []), key=lambda k: k["t"]):
        if k["z"] > 1.001:
            if aberto:
                out.append({**aberto, "fim": max(aberto["inicio"] + 0.2, k["t"])})
            aberto = {"id": f"z{len(out)}", "inicio": k["t"], "fim": k["t"] + 3, "z": k["z"],
                      "tipo": "suave" if k.get("d", 2.6) > 0 else "seco"}
        elif aberto:
            extra = k.get("d", 0) if aberto["tipo"] == "suave" else 0
            out.append({**aberto, "fim": max(aberto["inicio"] + 0.2, k["t"] + extra)})
            aberto = None
    if aberto:
        out.append({**aberto, "fim": projeto["duracao_fonte"]})
    out.sort(key=lambda z: z["inicio"])
    for i in range(len(out) - 1):
        out[i]["fim"] = min(out[i]["fim"], out[i + 1]["inicio"])
    return [z for z in out if z["fim"] - z["inicio"] > 0.1]


def expressao_zoom(projeto, mapa):
    def s(x):   # suavização (smoothstep) de x já entre 0 e 1
        return f"(({x})*({x})*(3-2*({x})))"
    expr = "1"
    for k in reversed(sorted(blocos_zoom(projeto), key=lambda z: z["inicio"])):
        iv = mapa.intervalo(k["inicio"], k["fim"])
        if not iv:
            continue
        a, b = iv
        z, dz, n = k["z"], k["z"] - 1, b - a
        if k.get("tipo") == "seco":
            dentro = f"{z}"
        elif k.get("tipo") == "lento":
            dentro = f"(1+{dz:.4f}*{s(f'min(max((t-{a:.3f})/{n:.3f},0),1)')})"
        else:
            r = min(1.2, n / 3)
            ent, sai = f"min(max((t-{a:.3f})/{r:.3f},0),1)", f"min(max(({b:.3f}-t)/{r:.3f},0),1)"
            dentro = f"if(lt(t,{a + r:.3f}),1+{dz:.4f}*{s(ent)},if(gt(t,{b - r:.3f}),1+{dz:.4f}*{s(sai)},{z}))"
        expr = f"if(between(t,{a:.3f},{b:.3f}),{dentro},{expr})"
    return expr


# ---------------------------------------------------------------- cor (Lumetri)
PRESETS_COR = {
    "natural": "",
    "cinema": "eq=contrast=1.07:brightness=-0.012:saturation=1.07,colorbalance=rs=0.025:bs=-0.025:rm=0.018:bm=-0.018,"
              "curves=all='0/0 0.25/0.225 0.5/0.5 0.75/0.775 1/1'",
    "quente": "eq=saturation=1.05,colorbalance=rs=0.06:bs=-0.06:rm=0.05:bm=-0.05:rh=0.03:bh=-0.03",
    "frio": "eq=saturation=1.02,colorbalance=rs=-0.05:bs=0.06:rm=-0.04:bm=0.05",
    "vibrante": "eq=saturation=1.3:contrast=1.08",
    "pb": "hue=s=0,eq=contrast=1.1",
}


def filtro_cor(projeto):
    partes = [PRESETS_COR.get(projeto.get("cor", "cinema"), "")]
    a = projeto.get("ajuste_cor") or {}
    ex, co, sa, te = (a.get(c, 0) / 100 for c in ("exposicao", "contraste", "saturacao", "temperatura"))
    if ex or co or sa:
        partes.append(f"eq=brightness={ex * 0.25:.3f}:contrast={1 + co * 0.5:.3f}:saturation={max(0, 1 + sa):.3f}")
    if te:
        k = te * 0.12
        partes.append(f"colorbalance=rs={k:.3f}:bs={-k:.3f}:rm={k:.3f}:bm={-k:.3f}:rh={k / 2:.3f}:bh={-k / 2:.3f}")
    return ",".join(p for p in partes if p) or "null"


# ---------------------------------------------------------------- mídias
def moldura_imagem(arquivo, w, h, pasta, raio=34):
    """Recorta sem deformar (sobra 12% pro zoom lento) + máscara de cantos arredondados."""
    im = Image.open(arquivo).convert("RGB")
    esc = max(w * 1.12 / im.width, h * 1.12 / im.height)
    im = im.resize((max(1, int(im.width * esc)), max(1, int(im.height * esc))), Image.LANCZOS)
    base = Path(pasta) / "_tmp" / Path(arquivo).stem
    base.parent.mkdir(exist_ok=True)
    im.save(f"{base}.png")
    mascara(w, h, f"{base}_mask.png", raio)
    return f"{base}.png", f"{base}_mask.png", im.size


def mascara(w, h, destino, raio=34):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], raio, fill=255)
    m.save(destino)


# ---------------------------------------------------------------- montagem
def renderizar(pasta, previa=False, progresso=None):
    """previa=True: monta tudo em 540×960 a partir do proxy.mp4 (540p, o mesmo do
    player) — decodificar o bruto 4K HEVC era o que deixava a prévia lenta.
    O final lê o bruto com decodificação de hardware (VideoToolbox).
    progresso(fração 0–1) é chamado durante a montagem."""
    pasta = Path(pasta)
    k = 0.5 if previa else 1.0
    LW, LH = int(LARG * k), int(ALT * k)
    projeto = json.loads((pasta / "projeto.json").read_text())
    segs = trechos_mantidos(projeto)
    mapa = Mapa(segs)
    dur = mapa.duracao
    gerar_ass(projeto, mapa, pasta / "_tmp_legendas.ass")

    proxy = pasta / "proxy.mp4"
    if previa and proxy.exists():
        args = [FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(proxy)]
    else:
        args = [FF, "-hide_banner", "-loglevel", "error", "-y", "-hwaccel", "videotoolbox", "-i", projeto["fonte"]]
    fc = []
    for i, (a, b) in enumerate(segs):
        d = b - a
        buracos = [(max(a, l["inicio"]) - a, min(b, l["fim"]) - a) for l in projeto.get("lacunas", [])
                   if l["fim"] > a and l["inicio"] < b]
        preto = "".join(f",drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,{x:.3f},{y:.3f})'" for x, y in buracos)
        mudo = "".join(f",volume=0:enable='between(t,{x:.3f},{y:.3f})'" for x, y in buracos)
        fc.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS{preto}[v{i}]")
        fc.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS{mudo},afade=t=in:d=0.012,"
                  f"afade=t=out:st={max(0, d - 0.018):.3f}:d=0.018[a{i}]")
    fc.append("".join(f"[v{i}][a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=1[vc][ac]")
    z = expressao_zoom(projeto, mapa)
    cor = filtro_cor(projeto)
    fc.append(f"[vc]fps={FPS},scale=w='{LW}*({z})':h='{LH}*({z})':eval=frame:flags={'bilinear' if previa else 'lanczos'},"
              f"crop={LW}:{LH}:(iw-{LW})/2:(ih-{LH})*0.32,setsar=1,{cor}[vbase]")
    ultimo, entrada = "vbase", 1
    for n, m in enumerate(projeto.get("midias", [])):
        iv = mapa.intervalo(m["inicio"], m["fim"])
        if not iv:
            continue
        a, b = iv
        w, h, x, y = (int(m[c] * k) for c in ("w", "h", "x", "y"))
        if m["tipo"] == "imagem":
            png, msk, (iw, ih) = moldura_imagem(m["arquivo"], w, h, pasta, raio=int(34 * k))
            fim = f"{min(dur, b + 0.5):.2f}"   # a imagem só existe até sair da tela
            args += ["-loop", "1", "-framerate", str(FPS), "-t", fim, "-i", png,
                     "-loop", "1", "-framerate", str(FPS), "-t", fim, "-i", msk]
            zexp = f"(1+0.10*min(max((t-{a:.2f})/{b - a:.2f},0),1))"   # zoom lento dentro da moldura
            fc.append(f"[{entrada}:v]format=rgb24,scale=w='{iw}*{zexp}':h='{ih}*{zexp}':eval=frame,"
                      f"crop={w}:{h}:(iw-{w})/2:(ih-{h})/2,format=rgba[img{n}]")
        else:   # vídeo: entra no tempo dele, sem áudio, recortado na moldura
            msk = pasta / "_tmp" / f"mask_{n}.png"
            msk.parent.mkdir(exist_ok=True)
            mascara(w, h, msk, int(34 * k))
            args += ["-itsoffset", f"{a:.3f}", "-i", m["arquivo"],
                     "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.2f}", "-i", str(msk)]
            fc.append(f"[{entrada}:v]fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase,"
                      f"crop={w}:{h},format=rgba[img{n}]")
        fc.append(f"[{entrada + 1}:v]format=gray[msk{n}]")
        fc.append(f"[img{n}][msk{n}]alphamerge,fade=t=in:st={a:.2f}:d=0.35:alpha=1,"
                  f"fade=t=out:st={max(a, b - 0.35):.2f}:d=0.35:alpha=1[im{n}]")
        fc.append(f"[{ultimo}][im{n}]overlay={x}:{y}:eof_action=pass:enable='between(t,{a:.2f},{b:.2f})'[ov{n}]")
        ultimo, entrada = f"ov{n}", entrada + 2
    fc.append(f"[{ultimo}]subtitles={pasta / '_tmp_legendas.ass'}:fontsdir={FONTES},format=yuv420p[vout]")
    fc.append("[ac]highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000[voz]")
    mus = projeto.get("musica")
    if mus and Path(mus["arquivo"]).exists():
        args += ["-stream_loop", "-1", "-i", mus["arquivo"]]
        fc.append(f"[{entrada}:a]atrim=0:{dur:.2f},asetpts=PTS-STARTPTS,volume={mus.get('volume', 0.07)},"
                  f"afade=t=in:d=1.5,afade=t=out:st={max(0, dur - 3):.2f}:d=3,aresample=48000[mus]")
        fc.append(f"[voz][mus]amix=inputs=2:normalize=0:duration=first,afade=t=out:st={max(0, dur - 0.4):.2f}:d=0.4[aout]")
    else:
        fc.append(f"[voz]afade=t=out:st={max(0, dur - 0.4):.2f}:d=0.4[aout]")
    (pasta / "_tmp_filtro.txt").write_text(";\n".join(fc))
    saida = pasta / ("previa.mp4" if previa else "final.mp4")
    temp = saida.with_suffix(".tmp.mp4")
    qualidade = ["-preset", "ultrafast", "-crf", "28"] if previa else ["-preset", "medium", "-crf", "21"]
    args += ["-filter_complex_script", str(pasta / "_tmp_filtro.txt"), "-map", "[vout]", "-map", "[aout]",
             "-c:v", "libx264", *qualidade, "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{dur:.2f}",
             "-progress", "pipe:1", "-nostats", str(temp)]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for linha in proc.stdout:
        if progresso and linha.startswith("out_time_us=") and linha[12:].strip().isdigit():
            try:
                progresso(min(1.0, int(linha[12:]) / 1e6 / max(dur, 0.1)))
            except Exception:
                pass
    erro = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg falhou: {erro.strip()[-300:]}")
    temp.replace(saida)   # troca só no fim: o player nunca pega arquivo pela metade
    return saida, dur


if __name__ == "__main__":
    s, d = renderizar(sys.argv[1], previa="--previa" in sys.argv)
    print(f"pronto: {s} ({d:.1f}s)")
