"""Confere se os usuários migrados podem fazer login; nunca lê ou registra senhas."""
from migration_db import connect

c = connect()
try:
    q = c.cursor()
    q.execute("""
        SELECT id, email,
               encrypted_password IS NOT NULL AND encrypted_password <> '' AS tem_senha,
               email_confirmed_at IS NOT NULL AS confirmado,
               banned_until IS NOT NULL AS banido,
               deleted_at IS NOT NULL AS excluido,
               aud, role
        FROM auth.users
        ORDER BY created_at
    """)
    for row in q.fetchall():
        print('USER', row)
    q.execute('SELECT user_id, provider FROM auth.identities ORDER BY provider')
    for row in q.fetchall():
        print('IDENTITY', row)
finally:
    c.rollback()
    c.close()
