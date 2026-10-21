"""Transcreve o vídeo de um link (Instagram, TikTok, YouTube…) para os funcionários de IA lerem.

    python3 scripts/transcrever-link.py <link> [--rapido]

Usa o mesmo transcritor do Modo Creator do app (src-tauri/src/creator/transcrever.py: yt-dlp baixa só o
áudio e o Whisper transcreve aqui no Mac). Um trabalho pesado por vez (trava do Danilo), porque o Mac
tem 8 GB. Imprime título, autor, duração e o texto. 20/10: o João (conta do Marcelo) respondeu "não
consigo abrir o post do Instagram" — agora qualquer funcionário de qualquer conta abre.
"""
import fcntl
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
WORKER = RAIZ / "src-tauri" / "src" / "creator" / "transcrever.py"
CREATOR = Path.home() / ".infopro-hub" / "creator"
TRAVA = Path.home() / ".infopro-hub" / "danilo" / "pesado.lock"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    url = args[0]
    modo = "rapido" if "--rapido" in sys.argv else "preciso"
    TRAVA.parent.mkdir(parents=True, exist_ok=True)
    with open(TRAVA, "w") as trava:
        fcntl.flock(trava, fcntl.LOCK_EX)   # espera o Danilo/WhatsApp terminarem o que é pesado
        env = {**os.environ, "PYTHONPATH": str(CREATOR)}
        p = subprocess.Popen([sys.executable, str(WORKER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, text=True, env=env)
        try:
            p.stdin.write(json.dumps({"id": str(uuid.uuid4()), "url": url, "modo": modo}) + "\n")
            p.stdin.flush()
            linha = p.stdout.readline()
        finally:
            p.kill()
    if not linha:
        sys.exit("Não consegui transcrever (o transcritor não respondeu).")
    r = json.loads(linha)
    if r.get("erro"):
        sys.exit(f"Não consegui transcrever: {r['erro']}")
    print(f"Título: {r.get('titulo') or '-'}\nAutor: {r.get('autor') or '-'}\nDuração: {r.get('duracao') or '-'} s\n")
    print(r.get("texto", "").strip())


if __name__ == "__main__":
    main()
