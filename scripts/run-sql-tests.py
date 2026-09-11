"""Executa os testes SQL de regressão sem gravar nada: tudo volta no rollback."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
tests = sorted(p.name for p in (root / 'supabase/tests').glob('*.sql'))
c = connect()
failed = []
try:
    q = c.cursor()
    for test in tests:
        sql = (root / 'supabase/tests' / test).read_text()
        # Os arquivos trazem BEGIN/ROLLBACK próprios; aqui o savepoint isola cada teste.
        sql = re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', sql, flags=re.M)
        q.execute('SAVEPOINT regression')
        try:
            q.execute(sql)
            print('TEST_OK', test, flush=True)
        except Exception as e:
            d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
            print('TEST_FAILED', test, d.get('C'), d.get('M'), flush=True)
            failed.append(test)
        q.execute('ROLLBACK TO SAVEPOINT regression')
finally:
    c.rollback()
    c.close()
sys.exit(1 if failed else 0)
