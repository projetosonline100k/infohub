"""(21/11/2026) Quiz instalivros-v2: a abertura vira a 1ª pergunta ("Pra começar, você é:" Homem/Mulher) com a imagem e o título no topo,
sem a tela "oi" com o botão Começar. Vale no rascunho (estrutura) e no que o link mostra (estrutura_publicada), sem publicar mais nada do rascunho.
Guarda o que havia em ~/.infopro-hub/backups/. Desfazer: python3 scripts/quiz-primeira-tela-genero.py --desfazer"""
import json, sys, time
from pathlib import Path
from migration_db import connect

SLUG = "instalivros-v2"
pasta = Path.home() / ".infopro-hub" / "backups"
c = connect(); q = c.cursor()

def trocar(e):
    g = next((p for p in e["perguntas"] if p.get("id") == "genero"), None)
    if g:   # já existe (versão com mascote): troca para o visual do 12min
        oi_titulo = g["cabecalho"].get("subtitulo") or g["cabecalho"].get("titulo")
        g.update({"estilo": "cartoes", "sem_mascote": True, "cabecalho": {"selo": "Quiz de 2 minutos", "titulo": "Descubra como pessoas ocupadas e sem tempo estão terminando **7 livros por semana** com apenas **20 minutos por dia**", "subtitulo": "Não se assuste se você se tornar a pessoa mais interessante da mesa."}})
        return True
    oi = next(t for t in e["telas"] if t["id"] == "oi")
    e["perguntas"].insert(0, {"id": "genero", "texto": "Pra começar, você é:", "estilo": "cartoes", "sem_mascote": True,
                              "cabecalho": {"selo": "Quiz de 2 minutos", "titulo": "Descubra como pessoas ocupadas e sem tempo estão terminando **7 livros por semana** com apenas **20 minutos por dia**", "subtitulo": oi["titulo"]},
                              "opcoes": [{"emoji": "👨", "texto": "Homem"}, {"emoji": "👩", "texto": "Mulher"}]})
    e["telas"] = [t for t in e["telas"] if t["id"] != "oi"]
    return True

try:
    if "--desfazer" in sys.argv:
        for col, padrao in (("estrutura", f"quiz-{SLUG}-1*.json"), ("estrutura_publicada", f"quiz-{SLUG}-publicada-*.json")):
            arq = sorted(pasta.glob(padrao))[0 if col == "estrutura" else 0]
            q.execute(f"UPDATE quizzes SET {col} = %s::jsonb WHERE slug = %s", (arq.read_text(), SLUG)); print("DESFEITO", col, arq.name)
        c.commit(); sys.exit(0)
    for col in ("estrutura", "estrutura_publicada"):
        q.execute(f"SELECT {col}::text FROM quizzes WHERE slug = %s", (SLUG,))
        antes = q.fetchone()[0]; e = json.loads(antes)
        if trocar(e):
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / f"quiz-{SLUG}{'-publicada' if col != 'estrutura' else ''}-{int(time.time())}.json").write_text(antes)
            q.execute(f"UPDATE quizzes SET {col} = %s::jsonb WHERE slug = %s", (json.dumps(e, ensure_ascii=False), SLUG))
            print("APLICADO", col, len(e["perguntas"]), "perguntas")
        else:
            print("JA_TEM", col)
    c.commit()
except Exception as ex:
    c.rollback(); print("FALHOU", ex)
