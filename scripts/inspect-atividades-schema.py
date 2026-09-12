from migration_db import connect
c = connect()
try:
    q = c.cursor()
    q.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='atividades'
        ORDER BY ordinal_position
    """)
    print('--- atividades columns ---')
    for r in q.fetchall():
        print(r)

    q.execute("""
        SELECT polname, polpermissive, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
        FROM pg_policy WHERE polrelid = 'public.atividades'::regclass ORDER BY polname
    """)
    print('--- atividades policies ---')
    for r in q.fetchall():
        print(r)

    q.execute("""
        SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'public.atividades'::regclass AND NOT tgisinternal
    """)
    print('--- atividades triggers ---')
    for r in q.fetchall():
        print(r)
finally:
    c.rollback()
    c.close()
