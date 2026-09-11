"""Restore the reviewed backup SQL atomically into the verified empty project."""
from pathlib import Path
import io
import json
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
text = (root / '.migration.local/restore.sql').read_text()
text = re.sub(r'^\\(?:un)?restrict .*\n', '', text, flags=re.M)
pattern = re.compile(r'^(COPY ([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*) \([^\n]+\) FROM stdin;)\n(.*?)^\\\.\n', re.M | re.S)
blocks = list(pattern.finditer(text))
if not blocks:
    raise SystemExit('NO_DATA_BLOCKS: restauração cancelada.')
pre = text[:blocks[0].start()]
post = text[blocks[-1].end():]
for left, right in zip(blocks, blocks[1:]):
    between = text[left.end():right.start()]
    if re.sub(r'--[^\n]*', '', between).strip():
        raise SystemExit('UNEXPECTED_INTERLEAVED_SQL: revisar extração.')
data = {m[2]: (m[1], m[3], len(m[3].splitlines())) for m in blocks}
assert len(data) == len(blocks)
print('PLAN:', len(data), 'tabelas;', sum(v[2] for v in data.values()), 'registros', flush=True)
if '--apply' not in sys.argv:
    for name, (_, _, count) in data.items():
        print(name, count)
    raise SystemExit(0)
conn = None
phase = 'connect'
try:
    conn = connect()
    cur = conn.cursor()
    cur.execute('SET LOCAL lock_timeout = \'10s\'')
    cur.execute("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
    if cur.fetchone()[0]:
        raise RuntimeError('TARGET_NOT_EMPTY')
    for name in data:
        if name.startswith(('auth.', 'storage.')):
            cur.execute('SELECT count(*) FROM ' + name)
            if cur.fetchone()[0]:
                raise RuntimeError('TARGET_NOT_EMPTY')
    phase = 'schema'
    cur.execute(pre)
    cur.execute("""SELECT n.nspname || '.' || t.relname, rn.nspname || '.' || rt.relname
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_class rt ON rt.oid=c.confrelid
        JOIN pg_namespace rn ON rn.oid=rt.relnamespace
        WHERE c.contype='f'""")
    deps = {name: set() for name in data}
    for child, parent in cur.fetchall():
        if child in data and parent in data and child != parent:
            deps[child].add(parent)
    done = {name for name in data if data[name][2] == 0}
    pending = set(data) - done
    while pending:
        ready = sorted(name for name in pending if deps[name] <= done)
        if not ready:
            raise RuntimeError('CYCLIC_DATA_DEPENDENCIES')
        for name in ready:
            phase = name
            sql, rows, count = data[name]
            cur.execute(sql, stream=io.StringIO(rows))
            print('COPIED:', name, count, flush=True)
            done.add(name)
            pending.remove(name)
    phase = 'constraints_and_policies'
    cur.execute(post)
    phase = 'verify_counts'
    counts = {}
    for name, (_, _, expected) in data.items():
        cur.execute('SELECT count(*) FROM ' + name)
        actual = cur.fetchone()[0]
        if actual != expected:
            raise RuntimeError('COUNT_MISMATCH')
        counts[name] = actual
    cur.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity")
    rls = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM pg_policies WHERE schemaname='public'")
    policies = cur.fetchone()[0]
    cur.execute("NOTIFY pgrst, 'reload schema'")
    phase = 'commit'
    conn.commit()
    report = {'status': 'restored', 'counts': counts, 'public_rls_tables': rls, 'public_policies': policies}
    (root / '.migration.local/restore-result.json').write_text(json.dumps(report, indent=2))
    print('RESTORE_OK:', sum(counts.values()), 'registros; RLS:', rls, '; policies:', policies)
except Exception as exc:
    if conn is not None:
        conn.rollback()
    detail = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
    print('RESTORE_FAILED: phase=' + phase + ' type=' + type(exc).__name__ + ' SQLSTATE=' + detail.get('C', ''))
    # SQL errors can contain row contents, so never print their raw detail.
    if isinstance(exc, RuntimeError):
        print(str(exc))
    sys.exit(1)
finally:
    if conn is not None:
        conn.close()
