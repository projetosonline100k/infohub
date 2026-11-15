"""Põe os 3 planos na oferta do quiz do Instalivros (15/11/2026, pedido do Davi), no rascunho e no publicado.
Só mexe em oferta.planos (jsonb_set na linha atual: o resto, inclusive edições não publicadas e pedidos da fila, fica como está).
`--testar` faz tudo e desfaz no fim (nada gravado)."""
import json
import sys
from migration_db import connect

QUIZ = 'dccceb2d-e90d-4d86-be86-1aae7597de10'
planos = [
    {'id': 'anual', 'nome': 'Anual', 'preco_de': 'R$297,00', 'preco': 'R$147,00', 'parcelas': {'n': 12, 'valor': 'R$16,30'},
     'equivalente': '≈ R$12,25/mês', 'cta_url': 'https://chk.eduzz.com/Q9N21JVZ01', 'destaque': True, 'selo': 'Mais escolhido', 'com_bonus': True},
    {'id': 'semestral', 'nome': 'Semestral', 'preco': 'R$77,90', 'parcelas': {'n': 6, 'valor': 'R$14,61'},
     'cta_url': 'https://chk.eduzz.com/KW8ZR26K01', 'com_bonus': False},
    # Davi mandou o mesmo link do semestral (provável engano): fica oculto até o link certo chegar.
    {'id': 'trimestral', 'nome': 'Trimestral', 'preco': 'R$39,90', 'parcelas': {'n': 3, 'valor': 'R$14,24'},
     'cta_url': 'https://chk.eduzz.com/KW8ZR26K01', 'com_bonus': False, 'oculto': True},
]
c = connect()
try:
    q = c.cursor()
    q.execute(
        "UPDATE quizzes SET estrutura = jsonb_set(estrutura, '{oferta,planos}', %s::jsonb, true), "
        "estrutura_publicada = jsonb_set(estrutura_publicada, '{oferta,planos}', %s::jsonb, true) "
        "WHERE id = %s AND estrutura->'oferta' IS NOT NULL AND estrutura_publicada->'oferta' IS NOT NULL RETURNING id",
        (json.dumps(planos), json.dumps(planos), QUIZ))
    rows = q.fetchall()
    assert len(rows) == 1, f'esperava 1 quiz, atualizou {len(rows)}'
    if '--testar' in sys.argv:
        c.rollback(); print('TESTADO (nada gravado)'); sys.exit(0)
    c.commit(); print('PLANOS_APLICADOS')
except Exception:
    c.rollback(); raise
