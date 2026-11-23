"""Aplica 20261123180000_quiz_envio_video_de_volta (função quiz_envio_permitido volta a aceitar mp4/webm e quiz pausado)."""
from pathlib import Path
from migration_db import connect

root = Path(__file__).resolve().parents[1]
sql = (root / 'supabase/migrations/20261123180000_quiz_envio_video_de_volta.sql').read_text()
c = connect()
q = c.cursor()
q.execute(sql)
q.execute('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING', ('20261123180000', 'quiz_envio_video_de_volta', [sql]))
c.commit()
print('QUIZ_ENVIO_VIDEO_APPLIED')
