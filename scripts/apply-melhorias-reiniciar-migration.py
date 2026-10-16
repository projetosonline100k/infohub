"""Aplica 20261016191500_melhorias_reiniciar e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261016191500'
name = 'melhorias_reiniciar'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    # Teste de migração de outro chat que ainda não foi aplicada (ex.: Dalila) fica de fora.
    q.execute('SELECT version FROM supabase_migrations.schema_migrations')
    aplicadas = {r[0] for r in q.fetchall()} | {version}
    pendentes = {m.name.split('_', 1)[1] for m in (root / 'supabase/migrations').glob('*.sql')
                 if m.name.split('_', 1)[0] not in aplicadas}
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*.sql')):
        if test in pendentes:
            print('TEST_PULADO', test, '(migração ainda não aplicada)', flush=True)
            continue
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = (root / 'supabase/tests' / test).read_text()
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('MELHORIAS_REINICIAR_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('MELHORIAS_REINICIAR_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
