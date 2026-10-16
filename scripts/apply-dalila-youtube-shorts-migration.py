"""Aplica 20261016121500_dalila_youtube_shorts e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261016121500'
name = 'dalila_youtube_shorts'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    # O teste do YouTube fica em supabase/tests/pendentes/ enquanto a migração não
    # está aplicada (ele trava os outros apply-*.py); aqui ele roda junto. Ao
    # aplicar, mover o arquivo de volta para supabase/tests/ no mesmo commit.
    testes = sorted((root / 'supabase/tests').glob('*.sql')) + sorted((root / 'supabase/tests/pendentes').glob('dalila_youtube_shorts.sql'))
    for arquivo in testes:
        test = arquivo.name
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = arquivo.read_text()
        q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        q.execute('ROLLBACK TO SAVEPOINT regression')
        print('TEST_OK', test, flush=True)
    if testar:
        c.rollback()
        print('DALILA_YOUTUBE_SHORTS_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('DALILA_YOUTUBE_SHORTS_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
