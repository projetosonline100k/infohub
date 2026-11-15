"""Linha "✓ Acesso completo ao Instalivros" nos cartões de plano da oferta (15/11/2026, pedido do Davi), no rascunho e no publicado.
Só mexe em oferta.planos_acesso (jsonb_set na linha atual: o resto, inclusive edições não publicadas e pedidos da fila, fica como está).
`--testar` faz tudo e desfaz no fim (nada gravado)."""
import json
import sys
from migration_db import connect

QUIZ = 'dccceb2d-e90d-4d86-be86-1aae7597de10'
texto = 'Acesso completo ao Instalivros'
c = connect()
try:
    q = c.cursor()
    q.execute(
        "UPDATE quizzes SET estrutura = jsonb_set(estrutura, '{oferta,planos_acesso}', %s::jsonb, true), "
        "estrutura_publicada = jsonb_set(estrutura_publicada, '{oferta,planos_acesso}', %s::jsonb, true) "
        "WHERE id = %s AND estrutura->'oferta' IS NOT NULL AND estrutura_publicada->'oferta' IS NOT NULL RETURNING id",
        (json.dumps(texto), json.dumps(texto), QUIZ))
    rows = q.fetchall()
    assert len(rows) == 1, f'esperava 1 quiz, atualizou {len(rows)}'
    if '--testar' in sys.argv:
        c.rollback(); print('TESTADO (nada gravado)'); sys.exit(0)
    c.commit(); print('PLANOS_ACESSO_APLICADO')
except Exception:
    c.rollback(); raise
