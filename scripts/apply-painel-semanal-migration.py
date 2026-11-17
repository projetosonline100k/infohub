"""Aplica 20261117060000_painel_semanal e roda todos os testes SQL. `--testar` faz tudo e desfaz."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261117060000'
name = 'painel_semanal'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv
c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*painel_semanal.sql')):
        phase = test
        q.execute('SAVEPOINT regression')
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', (root / 'supabase/tests' / test).read_text(), flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING', (version, name, [sql]))
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('PAINEL_SEMANAL_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FALHA', phase, d.get('M') or repr(e)[:300])
    sys.exit(1)
