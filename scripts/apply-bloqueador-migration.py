"""Aplica 20261020040000_bloqueador (bloqueador_config e bloqueador_sessoes, só do dono).
Transação curta: só a migração e o teste dela, com lock_timeout; a transação
é curta — só a migração e o teste dela, com lock_timeout — e os outros testes rodam
depois, à parte (scripts/run-sql-tests.py). `--testar` faz e desfaz (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261020040000'
name = 'bloqueador'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute("SET LOCAL lock_timeout = '5s'")
    q.execute(sql)
    phase = 'bloqueador.sql'
    q.execute('SAVEPOINT regression')
    test_sql = (root / 'supabase/tests/bloqueador.sql').read_text()
    q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
    q.execute('ROLLBACK TO SAVEPOINT regression')
    print('TEST_OK bloqueador.sql', flush=True)
    if testar:
        c.rollback()
        print('BLOQUEADOR_TESTADO (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('BLOQUEADOR_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
