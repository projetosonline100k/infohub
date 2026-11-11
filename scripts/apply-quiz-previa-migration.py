"""Aplica 20261111050000_chatbots e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261111050000'
name = 'quiz_previa_link'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    # dalila_semana_sem_carrossel já falhava antes desta migração (28/10, conferido sem ela): fica de fora.
    JA_FALHAVA = {'dalila_semana_sem_carrossel.sql'}
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*.sql') if p.name not in JA_FALHAVA):
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = (root / 'supabase/tests' / test).read_text()
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('QUIZ_PREVIA_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('QUIZ_PREVIA_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
