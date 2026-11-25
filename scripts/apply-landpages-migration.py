"""Aplica 20261125120000_landpages e roda o teste SQL da land page. `--testar` faz tudo e desfaz no fim (nada gravado)."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261125120000'
name = 'landpages'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    phase = 'landpages.sql'
    q.execute('SAVEPOINT regression')
    q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', (root / 'supabase/tests/landpages.sql').read_text(), flags=re.M))
    q.execute('ROLLBACK TO SAVEPOINT regression')
    print('TEST_OK landpages.sql', flush=True)
    if testar:
        c.rollback()
        print('LANDPAGES_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('LANDPAGES_APPLIED')
except SystemExit:
    raise
except Exception as e:
    c.rollback()
    print(f'FAILED in {phase}: {e}')
    sys.exit(1)
