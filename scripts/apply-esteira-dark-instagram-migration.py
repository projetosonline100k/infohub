"""Aplica 20261113160000_esteira_dark_instagram e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261113160000'
name = 'esteira_dark_instagram'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*.sql')):
        phase = test
        q.execute('SAVEPOINT regression')
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', (root / 'supabase/tests' / test).read_text(), flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('ESTEIRA_DARK_INSTAGRAM_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute("INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES (%s, %s, ARRAY[%s])", (version, name, sql))
    c.commit()
    print('ESTEIRA_DARK_INSTAGRAM_APLICADA')
except Exception as e:
    c.rollback()
    print('FALHOU em', phase, ':', e)
    sys.exit(1)
