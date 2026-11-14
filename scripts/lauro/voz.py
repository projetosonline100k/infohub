"""Voz dos vídeos do Lauro, local e fixa (13/11/2026, Davi escolheu a voz pm_santa do Kokoro: "deixa fixo para os outros vídeos que deram errado por conta da voz").
Não usa mais o ElevenLabs (sem créditos, sem baixar mp3 pelo Chrome). Kokoro (Apache 2.0, roda no chip do Mac, sem limite) lê o roteiro do início ao fim.

  python3 scripts/lauro/voz.py <id do roteiro (8 caracteres bastam)> [--velocidade 1.1] [--voz pm_santa] [--saida caminho.mp3]

Grava ~/.infopro-hub/exemplos/<perfil>/roteiros/<id>/voz.mp3 e imprime `VOZ_PRONTA <caminho> <segundos>s`. A velocidade e a voz podem vir do estilo do perfil
(estilo.voz = {"voz": "pm_santa", "velocidade": 1.1}); sem nada, vale pm_santa a 1.0. O vídeo é montado com esse mp3 (ffmpeg)."""
import argparse
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PASTA_TTS = Path.home() / ".infopro-hub" / "tts"
VENV_PY = PASTA_TTS / "venv" / "bin" / "python"
VOZ_PADRAO = "pm_santa"

# Precisa das bibliotecas do ambiente isolado: se foi chamado pelo python do sistema, recomeça dentro dele.
if Path(sys.prefix).resolve() != (PASTA_TTS / "venv").resolve() and VENV_PY.exists():
    os.execv(str(VENV_PY), [str(VENV_PY), *sys.argv])

sys.path.insert(0, str(Path.home() / ".infopro-hub" / "py"))
sys.path.insert(0, str(RAIZ / "scripts"))


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFD", t.lower()).encode("ascii", "ignore").decode()).strip("-") or "perfil"


def limpar(texto):
    """Só o que se fala: sem marcações de cena/[...], travessões viram pausa, espaços arrumados."""
    t = re.sub(r"\[[^\]]*\]", " ", texto)
    t = t.replace("—", ", ").replace("–", ", ")
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{2,}", "\n", t)).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--velocidade", type=float)
    ap.add_argument("--voz")
    ap.add_argument("--saida")
    a = ap.parse_args()
    from migration_db import connect
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT r.id::text, r.texto, p.nome, p.estilo FROM public.esteira_dark_roteiros r JOIN public.esteira_dark_perfis p ON p.id = r.perfil_id WHERE r.id::text LIKE %s || '%%' LIMIT 2", (a.id,))
        linhas = q.fetchall()
    finally:
        c.close()
    if len(linhas) != 1:
        sys.exit(f"Roteiro não encontrado (ou id ambíguo): {a.id}")
    rid, texto, perfil, estilo = linhas[0]
    estilo = estilo if isinstance(estilo, dict) else {}
    cfg = estilo.get("voz") if isinstance(estilo.get("voz"), dict) else {}
    voz = a.voz or cfg.get("voz") or VOZ_PADRAO
    vel = a.velocidade or float(cfg.get("velocidade") or 1.0)
    pasta = None
    for p in (Path.home() / ".infopro-hub" / "exemplos").glob(f"*/roteiros/{rid[:8]}"):
        pasta = p
    pasta = pasta or Path.home() / ".infopro-hub" / "exemplos" / slug(perfil) / "roteiros" / rid[:8]
    pasta.mkdir(parents=True, exist_ok=True)
    saida = Path(a.saida) if a.saida else pasta / "voz.mp3"

    import soundfile as sf
    from kokoro_onnx import Kokoro
    k = Kokoro(str(PASTA_TTS / "kokoro-v1.0.onnx"), str(PASTA_TTS / "voices-v1.0.bin"))
    audio, sr = k.create(limpar(texto), voice=voz, speed=vel, lang="pt-br")
    wav = saida.with_suffix(".wav")
    sf.write(wav, audio, sr)
    ff = Path.home() / ".infopro-hub" / "creator-bin" / "ffmpeg"
    subprocess.run([str(ff if ff.exists() else "ffmpeg"), "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "192k", str(saida)], check=True)
    wav.unlink(missing_ok=True)
    print(f"VOZ_PRONTA {saida} {len(audio) / sr:.1f}s (voz {voz}, velocidade {vel})")


if __name__ == "__main__":
    main()
