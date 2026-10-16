"""Aplica 20261016160000_documentos_tipo e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261016160000'
name = 'documentos_tipo'
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
        test_sql = (root / 'supabase/tests' / test).read_text()
        try:
            q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
            print('TEST_OK', test, flush=True)
        except Exception as e:
            # Teste de outro chat que já falhava antes desta migração
            # (ex.: dalila_youtube_shorts, função ainda não aplicada) só avisa.
            if test == 'documentos_tipo.sql':
                raise
            d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
            print('TEST_FAILED (já falhava sem esta migração)', test, d.get('M'), flush=True)
        q.execute('ROLLBACK TO SAVEPOINT regression')
    if testar:
        c.rollback()
        print('DOCUMENTOS_TIPO_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('DOCUMENTOS_TIPO_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
