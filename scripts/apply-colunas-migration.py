from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20260911040000'
name = 'colunas_atividade'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    for test in ('colunas_atividade.sql', 'clientes_arquivado.sql', 'client_save.sql', 'pastas_atividade.sql', 'team_permissions.sql'):
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = (root / 'supabase/tests' / test).read_text()
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('COLUNAS_MIGRATION_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
