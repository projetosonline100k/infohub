"""27/10: devolve ao documento "Segundo Almeida" (Core) a versão das 16:50, recuperada do histórico de desfazer
do app (o documento foi salvo vazio às 16:55). Só grava se ele ainda estiver vazio."""
from pathlib import Path
import sys
from migration_db import connect

DOC = "6e331416-769c-4892-8504-1ad5c6f288ef"
html = (Path.home() / ".infopro-hub/segundo-almeida-recuperado-27-10.html").read_text()
if "ROTEIRO 01" not in html:
    sys.exit("cópia recuperada não parece certa")
c = connect()
cur = c.cursor()
cur.execute("UPDATE public.documentos SET conteudo = %s WHERE id = %s AND coalesce(conteudo, '') IN ('', '<p></p>') RETURNING length(conteudo)", (html, DOC))
linha = cur.fetchone()
c.commit()
print(f"restaurado: {linha[0]} caracteres" if linha else "nada feito (o documento já não está vazio)")
