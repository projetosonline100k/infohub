"""Consulta somente leitura ao banco do Infopro Hub.

Uso:  python3 scripts/consulta.py "select ... "
      python3 scripts/consulta.py --tabelas            (lista tabelas e contagens)
      python3 scripts/consulta.py --colunas atividades (colunas de uma tabela)

A transação roda em READ ONLY: qualquer INSERT/UPDATE/DELETE/DDL falha no
próprio Postgres. Nunca imprime credenciais.
"""
import json
import sys
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from migration_db import connect

LIMITE_LINHAS = 500


def fmt(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (Decimal, UUID)):
        return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False, default=str)
        return s if len(s) <= 300 else s[:300] + '…'
    if isinstance(v, str) and len(v) > 300:
        return v[:300] + '…'
    return v


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    if args[0] == '--tabelas':
        sql = """select relname as tabela, n_live_tup as linhas_aprox
                 from pg_stat_user_tables where schemaname = 'public'
                 order by relname"""
    elif args[0] == '--colunas':
        sql = f"""select column_name, data_type, is_nullable
                  from information_schema.columns
                  where table_schema = 'public' and table_name = '{args[1].replace("'", "")}'
                  order by ordinal_position"""
    else:
        sql = ' '.join(args)

    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute('begin transaction read only')
        cur.execute("set local statement_timeout = '20s'")
        cur.execute(sql)
        cols = [d[0] for d in cur.description or []]
        rows = cur.fetchmany(LIMITE_LINHAS + 1)
        for r in rows[:LIMITE_LINHAS]:
            print(json.dumps({c: fmt(v) for c, v in zip(cols, r)}, ensure_ascii=False, default=str))
        if len(rows) > LIMITE_LINHAS:
            print(f'… (mais de {LIMITE_LINHAS} linhas; refine a consulta)')
        cur.execute('rollback')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
