"""Reenvia o NOTIFY de recarregar schema para o PostgREST, em conexão própria."""
from migration_db import connect

c = connect()
try:
    q = c.cursor()
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('NOTIFY_SENT')
finally:
    c.close()
