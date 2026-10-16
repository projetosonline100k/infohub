"""Aplica 20261016173000_atividades_repetir e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261016173000'
name = 'atividades_repetir'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv
# Testes de outros chats que já falham no banco sem esta migração (em
# 16/10: a migração 20261016121500_dalila_youtube_shorts não foi aplicada e
# os setores das empresas copiadas mudaram desde os testes).
JA_FALHAVA = {'dalila_youtube_shorts.sql', 'empresa_instalivros.sql',
              'empresa_matheus_souto.sql', 'empresa_yuri.sql'}

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*.sql')):
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = (root / 'supabase/tests' / test).read_text()
        try:
            q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        except Exception:
            if test not in JA_FALHAVA:
                raise
            q.execute('ROLLBACK TO SAVEPOINT regression')
            print('TEST_JA_FALHAVA', test, flush=True)
            continue
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('ATIVIDADES_REPETIR_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('ATIVIDADES_REPETIR_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
