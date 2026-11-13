#!/usr/bin/env python3
"""Quiz Instalivros (13/11/2026, pedido do Davi): 1ª tela (id "oi") com fundo em degradê, balão grande,
enfeites em volta do mascote e selos. Só mexe nessa tela, no rascunho (estrutura) e no publicado
(estrutura_publicada), sem publicar outras edições pendentes. Rodar com --testar para ver sem gravar."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from migration_db import connect  # noqa: E402

QUIZ = 'dccceb2d-e90d-4d86-be86-1aae7597de10'
EXTRA = {
    'fundo': 'radial-gradient(ellipse 70% 38% at 50% 52%, #e3eafb 0%, rgba(227,234,251,0) 100%), linear-gradient(180deg, #dcebfb 0%, #f5f7fc 30%, #f6f7fc 70%, #e9effb 100%)',
    'balao_grande': True,
    'enfeites': [
        {'icone': 'livro', 'x': 13, 'y': 40, 'tam': 54, 'rot': -18, 'cor': '#2f6fe4'},
        {'icone': 'livros', 'x': 15, 'y': 78, 'tam': 50, 'rot': 6, 'cor': '#3b5bd6'},
        {'icone': 'estrela', 'x': 87, 'y': 42, 'tam': 44, 'rot': 12, 'cor': '#f6c33b'},
        {'icone': 'trofeu', 'x': 86, 'y': 78, 'tam': 48, 'rot': -6, 'cor': '#e8a920'},
        {'icone': 'brilho', 'x': 28, 'y': 22, 'tam': 22, 'cor': '#f6c33b'},
        {'icone': 'brilho', 'x': 76, 'y': 24, 'tam': 18, 'cor': '#2f6fe4'},
        {'icone': 'brilho', 'x': 80, 'y': 60, 'tam': 16, 'cor': '#f6c33b'},
        {'icone': 'brilho', 'x': 20, 'y': 60, 'tam': 16, 'cor': '#2f6fe4'},
    ],
    'selos': [
        {'icone': 'raio', 'texto': 'Rápido', 'fundo': '#d6e6fb', 'cor': '#1f5fd0'},
        {'icone': 'alvo', 'texto': 'Personalizado', 'fundo': '#e8dcfa', 'cor': '#6b36c9'},
        {'icone': 'controle', 'texto': 'Divertido', 'fundo': '#fbf1d3', 'cor': '#d9741a'},
        {'icone': 'relogio', 'texto': '2 min', 'fundo': '#d2f6ee', 'cor': '#0f6b57'},
    ],
}

testar = '--testar' in sys.argv
con = connect()
cur = con.cursor()
for col in ('estrutura', 'estrutura_publicada'):
    cur.execute(f'select {col} from quizzes where id = %s', (QUIZ,))
    e = cur.fetchone()[0]
    e = json.loads(e) if isinstance(e, str) else e
    tela = next(t for t in e['telas'] if t['id'] == 'oi')
    tela.update(EXTRA)
    print(col, '→ tela oi com', sorted(EXTRA))
    if not testar:
        cur.execute(f'update quizzes set {col} = %s::jsonb where id = %s', (json.dumps(e), QUIZ))
if testar:
    con.rollback()
else:
    con.commit()
    print('gravado')
