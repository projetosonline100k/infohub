#!/usr/bin/env python3
"""Quiz Instalivros (14/11/2026, pedido do Davi via Roy): 1ª tela (id "oi") com a imagem nova inteira
(imagem_cheia) no lugar do mascote animado e do balão. Só mexe nessa tela, no rascunho (estrutura) e no
publicado (estrutura_publicada), sem publicar outras edições pendentes. `animada`/`quadros` ficam: os quadros
ainda servem ao mascote das outras telas. Rodar com --testar para ver sem gravar."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migration_db import connect  # noqa: E402

QUIZ = 'dccceb2d-e90d-4d86-be86-1aae7597de10'
IMAGEM = 'https://ucjyobemrxqfcoopkcgb.supabase.co/storage/v1/object/public/quiz-imagens/roy/dccceb2d-e90d-4d86-be86-1aae7597de10/233e2a59-593f-4860-a792-bbb113196098/abertura.webp'

testar = '--testar' in sys.argv
con = connect()
cur = con.cursor()
for col in ('estrutura', 'estrutura_publicada'):
    cur.execute(f'select {col} from quizzes where id = %s', (QUIZ,))
    e = cur.fetchone()[0]
    e = json.loads(e) if isinstance(e, str) else e
    tela = next(t for t in e['telas'] if t['id'] == 'oi')
    tela['imagem'] = IMAGEM
    tela['imagem_cheia'] = True
    for k in ('falas', 'fala', 'balao_grande', 'botao_inicial'):
        tela.pop(k, None)
    print(col, '→ tela oi:', sorted(tela))
    if not testar:
        cur.execute(f'update quizzes set {col} = %s::jsonb where id = %s', (json.dumps(e), QUIZ))
if testar:
    con.rollback()
else:
    con.commit()
    print('gravado')
