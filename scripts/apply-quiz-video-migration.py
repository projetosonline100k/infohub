"""Aplica 20261111180000_quiz_video (bucket quiz-imagens aceita vídeo). Só mexe na config do bucket, sem policy nova:
não precisa da bateria de testes de RLS. `--testar` desfaz no fim."""
from pathlib import Path
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
migs = [('20261111180000', 'quiz_video'), ('20261111180100', 'quiz_video_envio')]
testar = '--testar' in sys.argv
c = connect()
try:
    q = c.cursor()
    sqls = [(v, n, (root / 'supabase/migrations' / f'{v}_{n}.sql').read_text()) for v, n in migs]
    q.execute("select" if False else "select 1")
    for _, _, sql in sqls:
        q.execute(sql)
    q.execute("select allowed_mime_types from storage.buckets where id='quiz-imagens'")
    print(q.fetchone()[0])
    if testar:
        c.rollback(); print('TESTADA (nada gravado)'); sys.exit(0)
    for v, n, sql in sqls:
        q.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING', (v, n, [sql]))
    c.commit(); print('QUIZ_VIDEO_APPLIED')
except Exception:
    c.rollback(); raise
finally:
    c.close()
