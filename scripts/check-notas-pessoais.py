"""Confere que um documento pessoal (cliente_id e atividade_id nulos) pode
ser criado, lido e atualizado por quem o criou — a base da Nota de Atividades."""
from migration_db import connect

c = connect()
phase = "setup"
try:
    q = c.cursor()
    q.execute("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000091','notas-owner-test@example.com',now())")
    q.execute("SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000091',true)")
    q.execute("SET LOCAL ROLE authenticated")

    phase = "insert"
    q.execute("INSERT INTO public.documentos(titulo, conteudo) VALUES ('Notas', '') RETURNING id")
    doc_id = q.fetchone()[0]

    phase = "select"
    q.execute("SELECT titulo FROM public.documentos WHERE id = %s AND cliente_id IS NULL AND atividade_id IS NULL", (doc_id,))
    if q.fetchone() is None:
        raise Exception("Documento pessoal não encontrado após inserir")

    phase = "update"
    q.execute("UPDATE public.documentos SET conteudo = '<p>oi</p>' WHERE id = %s", (doc_id,))

    print("NOTAS_PESSOAIS_OK")
except Exception as e:
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print("FAILED", phase, d.get("C"), d.get("M"), str(e))
    raise SystemExit(1)
finally:
    c.rollback()
    c.close()
