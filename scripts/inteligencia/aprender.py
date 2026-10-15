"""Aprendizados de cada funcionário com o Davi (pedido do Davi, 15/10/2026).

Quando o Davi corrige ou diz como gosta das coisas (e vale para as próximas
vezes), o funcionário anota aqui. Fica no item "Aprendizados com o Davi" da
Inteligência dele naquele projeto (tipo 'aprendizado'): o Davi vê e edita na
tela, e o ler.py mostra antes de cada trabalho.

  python3 scripts/inteligencia/aprender.py anotar --cliente <cliente_id> --agente roy "Davi prefere títulos afirmativos, sem pergunta"
  python3 scripts/inteligencia/aprender.py listar --cliente <cliente_id> --agente roy

Uma regra por linha, curta e no geral (não detalhes de uma tarefa só)."""
import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migration_db import connect  # noqa: E402

NOME = 'Aprendizados com o Davi'
MAXIMO = 60   # regras guardadas por funcionário/projeto (as mais antigas saem)


def _item(q, cliente, agente):
    q.execute("""SELECT id, conteudo FROM public.inteligencia_membros
                  WHERE cliente_id = %s AND agente = %s AND tipo = 'aprendizado' LIMIT 1""", (cliente, agente))
    return q.fetchone()


def anotar(cliente, agente, regra):
    regra = ' '.join(regra.split()).strip(' -•')
    if len(regra) < 5:
        sys.exit('Regra vazia.')
    c = connect()
    try:
        q = c.cursor()
        q.execute('SELECT user_id FROM public.clientes WHERE id = %s', (cliente,))
        dono = q.fetchone()
        if not dono:
            sys.exit('Projeto não encontrado.')
        q.execute('SELECT id FROM public.membros WHERE cliente_id = %s AND lower(nome) = %s LIMIT 1', (cliente, agente))
        membro = q.fetchone()
        atual = _item(q, cliente, agente)
        linhas = [l for l in (atual[1] or '').splitlines() if l.strip()] if atual else []
        if any(regra.lower() in l.lower() for l in linhas):
            print('Já estava anotado.')
            return
        linhas = (linhas + [f'- ({datetime.now():%d/%m}) {regra}'])[-MAXIMO:]
        texto = '\n'.join(linhas)
        if atual:
            q.execute("""UPDATE public.inteligencia_membros SET conteudo = %s, processado_em = now()
                          WHERE id = %s""", (texto, atual[0]))
        else:
            q.execute("""INSERT INTO public.inteligencia_membros
                           (cliente_id, user_id, membro_id, agente, escopo, tipo, nome, observacao, conteudo, status)
                         VALUES (%s, %s, %s, %s, 'projeto', 'aprendizado', %s, %s, %s, 'pronto')""",
                      (cliente, dono[0], membro[0] if membro else None, agente, NOME,
                       'Anotado pelo próprio funcionário quando o Davi corrige ou diz como gosta.', texto))
        c.commit()
        print(f'Anotado ({len(linhas)} aprendizados).')
    finally:
        c.close()


def listar(cliente, agente):
    c = connect()
    try:
        q = c.cursor()
        atual = _item(q, cliente, agente)
        print(atual[1] if atual and atual[1] else f'{agente}: nenhum aprendizado neste projeto ainda.')
    finally:
        c.rollback()
        c.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('acao', choices=['anotar', 'listar'])
    p.add_argument('--cliente', required=True)
    p.add_argument('--agente', required=True)
    p.add_argument('regra', nargs='?')
    a = p.parse_args()
    agente = a.agente.strip().lower()
    if a.acao == 'anotar':
        anotar(a.cliente, agente, a.regra or sys.stdin.read())
    else:
        listar(a.cliente, agente)


if __name__ == '__main__':
    main()
