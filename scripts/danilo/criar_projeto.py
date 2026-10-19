"""Cria o projeto de edição (projeto.json) a partir do bruto — a parte
mecânica do Danilo: transcrição palavra a palavra, cortes das pausas de
gravação, headline (fala exata do gancho, em blocos) e legendas curtas.
As escolhas "de gosto" (pinturas de cada momento, onde dar ênfase) vêm
num arquivo de escolhas que o Danilo (Claude) escreve — ou o mini editor.

  python3 criar_projeto.py <pasta> transcrever      → transcricao.json + audio.wav
  python3 criar_projeto.py <pasta> montar [escolhas.json]  → projeto.json

A pasta precisa ter bruto.* (cópia local do bruto).
escolhas.json (opcional):
  {"fim_fala": 137.7, "palavras_head": 21, "blocos_head": [3,4,2,3,3,4,2],
   "correcoes": [{"de": "impedirem,", "para": "pedirem,"}],
   "midias": [{"tipo":"imagem","arquivo":"...","inicio":7.4,"fim":15.6,"x":95,"y":1180,"w":425,"h":450}],
   "musica": {"arquivo": "...", "volume": 0.07}, "enfases": [32.1, 129.0],
   "cortes": [{"inicio": 74.3, "fim": 79.4, "motivo": "retomada"}],
   "destaques": [{"texto": "INSTALIVROS", "inicio": 191.3}]}
cortes = retomadas que o Danilo achou ouvindo (somam às pausas automáticas);
destaques = palavra fixa na tela (sem "fim" = até o último quadro).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

FF = os.path.expanduser("~/.infopro-hub/creator-bin/ffmpeg")


def bruto_de(pasta):
    for p in sorted(Path(pasta).glob("bruto.*")):
        return p
    raise SystemExit("sem bruto.* na pasta")


def transcrever(pasta):
    pasta = Path(pasta)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(bruto_de(pasta)),
                    "-vn", "-ac", "1", "-ar", "16000", str(pasta / "audio.wav")], check=True)
    sys.path.insert(0, os.path.expanduser("~/.infopro-hub/creator"))
    os.environ["PATH"] = os.path.expanduser("~/.infopro-hub/creator-bin") + os.pathsep + os.environ["PATH"]
    import mlx_whisper
    r = mlx_whisper.transcribe(str(pasta / "audio.wav"), path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
                               language="pt", word_timestamps=True, verbose=None)
    (pasta / "transcricao.json").write_text(json.dumps(r, ensure_ascii=False))
    return r


def silencios(pasta):
    out = subprocess.run([FF, "-hide_banner", "-i", str(Path(pasta) / "audio.wav"), "-af",
                          "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"], capture_output=True, text=True).stderr
    ini = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    fim = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    return list(zip(ini, fim))


def duracao(arquivo):
    out = subprocess.run([FF, "-hide_banner", "-i", str(arquivo)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def remocoes_auto(pasta, fim_fala, dur):
    """Pausas de gravação (> 0,6 s) viram respiro curto; ruídos isolados saem;
    tudo depois do fim da fala sai. Velocidade original."""
    fala, pos = [], 0.0
    for a, b in silencios(pasta):
        if a > pos:
            fala.append([pos, a])
        pos = b
    if pos < fim_fala:
        fala.append([pos, fim_fala])
    fala = [[a, min(b, fim_fala)] for a, b in fala if a < fim_fala and b - a >= 0.2]
    blocos = []
    for a, b in fala:
        if blocos and a - blocos[-1][1] <= 0.6:
            blocos[-1][1] = b
        else:
            blocos.append([a, b])
    mant = []
    for i, (a, b) in enumerate(blocos):
        antes = 0.30 if i and a - blocos[i - 1][1] > 2 else 0.12
        mant.append([max(0, a - antes), b + 0.20])
    for i in range(1, len(mant)):
        if mant[i][0] < mant[i - 1][1]:
            meio = (mant[i][0] + mant[i - 1][1]) / 2
            mant[i - 1][1] = mant[i][0] = meio
    rem, pos = [], 0.0
    for a, b in mant:
        if a - pos > 0.01:
            rem.append((pos, a))
        pos = b
    if dur - pos > 0.01:
        rem.append((pos, dur))
    return [{"id": f"auto{i}", "inicio": round(a, 3), "fim": round(b, 3), "origem": "auto",
             "motivo": "fim do vídeo" if b >= dur - 0.01 else ("início" if a <= 0.01 else "pausa de gravação")}
            for i, (a, b) in enumerate(rem)]


def juntar_remocoes(rem):
    """Remoções sobrepostas viram uma só (a do Danilo vence no motivo)."""
    out = []
    for r in sorted(rem, key=lambda r: r["inicio"]):
        if out and r["inicio"] <= out[-1]["fim"] + 0.001:
            out[-1]["fim"] = max(out[-1]["fim"], r["fim"])
            if r["origem"] != "auto":
                out[-1].update(origem=r["origem"], motivo=r["motivo"])
        else:
            out.append(dict(r))
    return out


def legendas(palavras, n_head, blocos_head):
    """Headline = as n_head primeiras palavras (o gancho), em blocos, 2 por tela.
    Depois, legendas de até ~24 caracteres quebrando na pontuação."""
    out = []
    head = palavras[:n_head]
    linhas, k = [], 0
    for tam in blocos_head:
        ws = head[k:k + tam]
        k += tam
        if ws:
            linhas.append((ws[0]["start"], ws[-1]["end"], " ".join(w["word"] for w in ws)))
    for j in range(0, len(linhas), 2):
        par = linhas[j:j + 2]
        fim = linhas[j + 2][0] if j + 2 < len(linhas) else par[-1][1] + 0.25
        out.append({"id": f"h{j // 2}", "tipo": "head", "inicio": round(par[0][0], 3), "fim": round(fim, 3),
                    "texto": "\n".join(t for _, _, t in par)})
    grupo, n = [], 0
    def fecha():
        nonlocal n
        if grupo:
            out.append({"id": f"l{n}", "tipo": "leg", "inicio": round(grupo[0]["start"], 3),
                        "fim": round(grupo[-1]["end"], 3), "texto": " ".join(w["word"] for w in grupo)})
            n += 1
            grupo.clear()
    for w in palavras[n_head:]:
        if grupo and (len(" ".join(x["word"] for x in grupo + [w])) > 24 or w["start"] - grupo[-1]["end"] > 0.5):
            fecha()
        grupo.append(w)
        if w["word"][-1:] in ".,?!":
            fecha()
    fecha()
    legs = [l for l in out if l["tipo"] == "leg"]
    for i, l in enumerate(legs):     # cada legenda fica até a próxima (máx. +0,15 s)
        prox = legs[i + 1]["inicio"] if i + 1 < len(legs) else l["fim"] + 0.4
        l["fim"] = round(min(max(l["fim"] + 0.15, l["inicio"] + 0.5), prox), 3)
    return out


def montar(pasta, escolhas=None):
    pasta = Path(pasta)
    esc = escolhas or {}
    tr = json.loads((pasta / "transcricao.json").read_text())
    bruto = bruto_de(pasta)
    dur = duracao(bruto)
    fim_fala = esc.get("fim_fala") or max(s["end"] for s in tr["segments"] if s["text"].strip())
    palavras = [{"word": w["word"].strip(), "start": w["start"], "end": min(w["end"], fim_fala)}
                for s in tr["segments"] for w in s.get("words", []) if w["start"] < fim_fala]
    # Palavras das retomadas cortadas não viram legenda.
    cortes = esc.get("cortes", [])
    palavras = [w for w in palavras if not any(c["inicio"] <= (w["start"] + w["end"]) / 2 <= c["fim"] for c in cortes)]
    for c in esc.get("correcoes", []):        # {"de", "para", "antes_de"?}
        for i, w in enumerate(palavras):
            prox = palavras[i + 1]["word"].lower() if i + 1 < len(palavras) else ""
            if w["word"] == c["de"] and (not c.get("antes_de") or prox.startswith(c["antes_de"].lower())):
                w["word"] = c["para"]
    projeto = {
        "fonte": str(bruto),
        "duracao_fonte": round(dur, 3),
        "remocoes": juntar_remocoes(remocoes_auto(pasta, fim_fala, dur) + [
            {"id": f"d{i}", "inicio": c["inicio"], "fim": c["fim"], "origem": "davi", "motivo": c.get("motivo", "retomada")}
            for i, c in enumerate(esc.get("cortes", []))]),
        "legendas": legendas(palavras, esc.get("palavras_head", 0), esc.get("blocos_head", [])),
        "midias": esc.get("midias", []),
        "musica": esc.get("musica"),
        "formato": esc.get("formato", "classico"),   # 'papel': tela dividida (papel.py, papel_cenas.py)
        "destaques": esc.get("destaques", []),
        "cor": "cinema",
        "zoom": [],
        "palavras": [{"t": w["word"], "s": round(w["start"], 3), "e": round(w["end"], 3)} for w in palavras],
    }
    # Zoom em Davi: alterna perto/longe a cada ~15 s do vídeo final + ênfases secas.
    from motor import Mapa, trechos_mantidos
    mapa = Mapa(trechos_mantidos(projeto))
    def no_bruto(tf):
        acc = 0.0
        for a, b in mapa.segs:
            if tf <= acc + (b - a):
                return a + (tf - acc)
            acc += b - a
    z, tf = 1.0, 12.0
    while tf < mapa.duracao - 5:
        z = 1.08 if z == 1.0 else 1.0
        projeto["zoom"].append({"t": round(no_bruto(tf), 3), "z": z, "d": 2.6})
        tf += 15.0
    for t in esc.get("enfases", []):
        projeto["zoom"].append({"t": t, "z": 1.13, "d": 0})
        projeto["zoom"].append({"t": t + 3.0, "z": 1.0, "d": 1.2})
    # O mini editor trabalha com o zoom em blocos (camada de ajuste).
    from motor import blocos_zoom
    projeto["zooms"], projeto["zoom"] = blocos_zoom(projeto), []
    (pasta / "projeto.json").write_text(json.dumps(projeto, ensure_ascii=False, indent=1))
    return projeto


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    pasta, acao = sys.argv[1], sys.argv[2]
    if acao == "transcrever":
        transcrever(pasta)
    else:
        esc = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else None
        p = montar(pasta, esc)
        print(f"{len(p['remocoes'])} remoções · {len(p['legendas'])} legendas · {len(p['midias'])} mídias")
