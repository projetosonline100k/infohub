"""Gera a chave do Atalho de um projeto (igual ao botão "Gerar atalho" do
Creator), rodando a função como o dono do projeto. A chave vai pra área de
transferência do Mac (pbcopy), nunca pro terminal.

    python3 scripts/apply-gerar-atalho-cliente.py <cliente_id>
"""
import json
import subprocess
import sys

from migration_db import connect

cliente = sys.argv[1]
conn = connect()
cur = conn.cursor()
cur.execute("select user_id from public.clientes where id = %s", (cliente,))
dono = cur.fetchone()[0]
cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(dono), "role": "authenticated"}),))
cur.execute("set local role authenticated")
cur.execute("select public.gerar_token_atalho_cliente(%s)", (cliente,))
token = cur.fetchone()[0]
conn.commit()
subprocess.run(["pbcopy"], input=token.encode(), check=True)
print("chave gerada e copiada para a área de transferência")
