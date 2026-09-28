"""Atualiza o nome de exibição de uma única conta pelo e-mail."""
import sys
from migration_db import connect

if len(sys.argv) != 3 or "@" not in sys.argv[1] or not sys.argv[2].strip():
    raise SystemExit("Uso: update-user-display-name.py email nome")

email = sys.argv[1].strip().lower()
nome = sys.argv[2].strip()
connection = connect()
try:
    cursor = connection.cursor()
    cursor.execute(
        """
        UPDATE auth.users
        SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('nome', CAST(%s AS text)),
            updated_at = now()
        WHERE lower(email) = %s AND deleted_at IS NULL
        RETURNING id
        """,
        (nome, email),
    )
    contas = cursor.fetchall()
    if len(contas) != 1:
        connection.rollback()
        raise SystemExit(f"Esperava uma conta; encontrei {len(contas)}.")

    connection.commit()
    print("Nome atualizado em 1 conta.")
finally:
    connection.close()
