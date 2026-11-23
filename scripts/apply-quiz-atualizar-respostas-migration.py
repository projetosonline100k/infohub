"""Aplica 20261123120000_quiz_atualizar_respostas (completa as respostas do lead depois do contato)."""
from pathlib import Path
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version, name = '20261123120000', 'quiz_atualizar_respostas'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
c = connect()
try:
    q = c.cursor()
    q.execute(sql)
    q.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING', (version, name, [sql]))
    c.commit()
    print('QUIZ_ATUALIZAR_RESPOSTAS_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
