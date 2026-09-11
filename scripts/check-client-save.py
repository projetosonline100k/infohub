from migration_db import connect
c=connect()
phase='setup'
try:
 q=c.cursor()
 q.execute("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000099','client-save-test@example.com',now())")
 q.execute("SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',true)")
 q.execute('SET LOCAL ROLE authenticated')
 phase='insert_client_returning'
 q.execute("INSERT INTO public.clientes(nome_especialista,idade,nicho,user_id) VALUES ('Teste transacional',28,'Teste',auth.uid()) RETURNING id")
 cid=q.fetchone()[0]
 phase='insert_team'
 q.execute("INSERT INTO public.equipe_cliente(cliente_id,nome_pessoa,papel) VALUES (%s,'Teste','Coprodutor')",(cid,))
 print('CLIENT_SAVE_OK')
except Exception as e:
 d=e.args[0] if e.args and isinstance(e.args[0],dict) else {}
 print('FAILED',phase,d.get('C'),d.get('M'))
 raise SystemExit(1)
finally:
 c.rollback(); c.close()
