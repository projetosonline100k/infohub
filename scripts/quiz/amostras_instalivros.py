"""Amostras de áudio do quiz Instalivros v2 (19/11/2026, Davi: o livro do dia é um destes 5 livros).

Corta o áudio gravado pelo Davi em 5 trechos (um por livro), transcreve (mlx-whisper), sobe no balde quiz-imagens (roy/<quiz>/amostras/)
e troca `amostra.amostras` na estrutura (RASCUNHO) do quiz: o Davi vê em Testar V2 → amostra e publica.

  PYTHONPATH=~/.infopro-hub/creator python3 scripts/quiz/amostras_instalivros.py /caminho/Audios.m4a [--gravar]

Sem --gravar só mostra o que faria (e já sobe/transcreve em /private/tmp)."""
import json
import os
import subprocess
import sys
import ssl
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migration_db import connect  # noqa: E402

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None

QUIZ = "ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7"
BASE = "https://ucjyobemrxqfcoopkcgb.supabase.co"
TMP = Path("/private/tmp/claude-501/clips")
# (id do livro no catálogo, título, autor, início, fim em segundos no áudio do Davi)
LIVROS = [
    (43, "Pai Rico, Pai Pobre", "Robert T. Kiyosaki e Sharon L. Lechter", 11.2, 76.4),
    (56, "O Poder do Hábito", "Charles Duhigg", 96.6, 166.0),
    (452, "Quem Pensa Enriquece", "Napoleon Hill", 185.0, 255.2),
    (53, "Como Fazer Amigos e Influenciar Pessoas", "Dale Carnegie", 273.6, 346.0),
    (87, "As Armas da Persuasão", "Robert B. Cialdini", 374.3, 439.0),
]


def chave():
    for l in (Path(__file__).resolve().parents[2] / ".env.migration.local").read_text().splitlines():
        if l.startswith(("SUPABASE_SECRET_KEY=", "SUPABASE_SERVICE_ROLE_KEY=")):
            return l.split("=", 1)[1].strip().strip("'\"")
    sys.exit("sem chave do Storage em .env.migration.local")


def subir(caminho, arquivo, k):
    req = urllib.request.Request(f"{BASE}/storage/v1/object/quiz-imagens/{caminho}", data=arquivo.read_bytes(), method="POST",
                                 headers={"Authorization": f"Bearer {k}", "apikey": k, "Content-Type": "audio/mp4", "x-upsert": "true"})
    try:
        urllib.request.urlopen(req, timeout=120, context=CTX).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"upload falhou {e.code}: {e.read()[:300]}")
    return f"{BASE}/storage/v1/object/public/quiz-imagens/{caminho}"


def main():
    fonte = sys.argv[1]
    gravar = "--gravar" in sys.argv
    TMP.mkdir(parents=True, exist_ok=True)
    import mlx_whisper
    k = chave()
    c0 = connect()
    q0 = c0.cursor()
    q0.execute("INSERT INTO quiz_envios (quiz_id) VALUES (%s) RETURNING token", (QUIZ,))   # a policy do balde pede um envio válido no caminho
    lote = str(q0.fetchone()[0])
    c0.commit()
    c0.close()
    novas = {}
    for lid, titulo, autor, a, b in LIVROS:
        arq = TMP / f"livro{lid}.m4a"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(a), "-to", str(b), "-i", fonte, "-af", f"afade=t=in:d=0.15,afade=t=out:st={b - a - 0.4:.2f}:d=0.4",
                        "-c:a", "aac", "-b:a", "96k", str(arq)], check=True)
        texto = mlx_whisper.transcribe(str(arq), path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="pt", verbose=None,
                                       condition_on_previous_text=False)["text"].strip()
        url = subir(f"roy/{QUIZ}/{lote}/amostra-{lid}.m4a", arq, k)
        novas[str(lid)] = {"titulo": titulo, "autor": autor, "audio_url": url, "texto_amostra": texto}
        print(lid, titulo, round(b - a), "s", url[-40:])
    if not gravar:
        return
    con = connect()
    cur = con.cursor()
    cur.execute("select estrutura from quizzes where id = %s", (QUIZ,))
    e = cur.fetchone()[0]
    e = json.loads(e) if isinstance(e, str) else e
    achou = 0
    for t in e["telas"]:
        if t.get("tipo") != "amostra":
            continue
        am = t.setdefault("amostra", {})
        antigas = am.get("amostras") or {}
        for lid, n in novas.items():
            n["minutos"] = (antigas.get(lid) or {}).get("minutos") or next((x["audio"] for x in json.load(open(Path(__file__).resolve().parents[2] / "src/data/livros-instalivros.json")) if str(x["id"]) == lid), None)
            if n["minutos"] is None:
                del n["minutos"]
        am["amostras"] = novas            # só os 5: o "livro do dia" sai deste conjunto
        achou += 1
    assert achou, "tela amostra não achada"
    cur.execute("update quizzes set estrutura = %s::jsonb, atualizado_em = now() where id = %s", (json.dumps(e, ensure_ascii=False), QUIZ))
    con.commit()
    print("gravado no rascunho:", achou, "tela(s) amostra;", ", ".join(novas))


if __name__ == "__main__":
    main()
