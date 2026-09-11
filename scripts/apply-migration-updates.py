"""Apply the four reviewed app updates and verify permissions before committing."""
from pathlib import Path
import re
import sys
from migration_db import connect
root = Path(__file__).resolve().parents[1]
files = [
    '20260728000000_add_backblaze_video_fields.sql',
    '20260728000001_add_edited_video_fields.sql',
    '20260827000000_add_account_ownership.sql',
    '20260911000000_team_permissions.sql',
]
conn = None
phase = 'connect'
try:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM auth.users WHERE lower(email) = 'eu.daviqueiroz22@gmail.com'")
    assert cur.fetchone()[0] == 1, 'OWNER_ACCOUNT_MISSING'
    for filename in files:
        phase = filename
        version, name = filename[:-4].split('_', 1)
        cur.execute('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = %s', (version,))
        if cur.fetchone():
            print('ALREADY_APPLIED:', filename, flush=True)
            continue
        sql = (root / 'supabase/migrations' / filename).read_text()
        sql = re.sub(r'^(?:BEGIN|COMMIT);\s*$', '', sql, flags=re.M)
        cur.execute(sql)
        cur.execute('INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES (%s, %s, %s)', (version, name, [sql]))
        print('APPLIED:', filename, flush=True)
    phase = 'permission_tests'
    cur.execute('SAVEPOINT permission_tests')
    sql = (root / 'supabase/tests/team_permissions.sql').read_text()
    sql = re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', sql, flags=re.M)
    cur.execute(sql)
    cur.execute('ROLLBACK TO SAVEPOINT permission_tests')
    print('PERMISSION_TESTS_OK: fixtures descartados.', flush=True)
    phase = 'owner_visibility'
    cur.execute("SELECT id FROM auth.users WHERE lower(email) = 'eu.daviqueiroz22@gmail.com'")
    owner = str(cur.fetchone()[0])
    cur.execute('SELECT count(*) FROM public.clientes')
    count = cur.fetchone()[0]
    cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (owner,))
    cur.execute('SET LOCAL ROLE authenticated')
    cur.execute('SELECT count(*) FROM public.clientes')
    assert cur.fetchone()[0] == count, 'OWNER_VISIBILITY_MISMATCH'
    cur.execute('RESET ROLE')
    cur.execute('SET LOCAL ROLE anon')
    cur.execute('SELECT count(*) FROM public.clientes')
    assert cur.fetchone()[0] == 0, 'ANON_ACCESS_NOT_BLOCKED'
    cur.execute('RESET ROLE')
    cur.execute("NOTIFY pgrst, 'reload schema'")
    conn.commit()
    print('APP_MIGRATIONS_OK: proprietário acessa todos os clientes; acesso anônimo bloqueado.')
except Exception as exc:
    if conn is not None:
        conn.rollback()
    detail = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
    print('MIGRATION_FAILED: phase=' + phase + ' type=' + type(exc).__name__ + ' SQLSTATE=' + detail.get('C', ''))
    if isinstance(exc, AssertionError):
        print(str(exc))
    sys.exit(1)
finally:
    if conn is not None:
        conn.close()
