from migration_db import connect
c = connect()
try:
    q = c.cursor()
    q.execute("""
        SELECT conname, conrelid::regclass::text, confrelid::regclass::text, confdeltype
        FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'public.atividades'::regclass
    """)
    print('--- FKs referencing atividades ---')
    for r in q.fetchall():
        print(r)
finally:
    c.rollback()
    c.close()
