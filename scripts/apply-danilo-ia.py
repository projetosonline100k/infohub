"""13/10/2026: no projeto Davi Queiroz o "Danilo" é o ChatGPT (IA) que edita
os vídeos — o Davi leva o vídeo até ele."""
from migration_db import connect

c = connect()
q = c.cursor()
q.execute("""UPDATE public.membros SET eh_ia = true, funcao = 'Editor de vídeos (IA · ChatGPT)'
             WHERE cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND nome = 'Danilo'""")
print(q.rowcount, "membro atualizado")
c.commit()
