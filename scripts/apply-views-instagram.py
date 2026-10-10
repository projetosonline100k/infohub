"""Preenche as views (e criador/data, se vazios) de referências do Instagram
que chegaram sem elas. Lê um JSON [{id, views, criador, data}] gerado pelo
yt-dlp logado na conta reserva. Só mexe onde visualizacoes ainda é null.

    python3 scripts/apply-views-instagram.py caminho/views.json
"""
import json
import sys

from migration_db import connect

itens = [i for i in json.load(open(sys.argv[1])) if i.get("views")]
conn = connect()
cur = conn.cursor()
total = 0
for i in itens:
    cur.execute(
        """update public.videos_referencia
              set visualizacoes = %s,
                  criador = coalesce(criador, %s),
                  data_publicacao = coalesce(data_publicacao, %s::date)
            where id = %s and visualizacoes is null""",
        (int(i["views"]), i.get("criador"), i.get("data"), i["id"]),
    )
    total += cur.rowcount
conn.commit()
print(f"{total} referências atualizadas")
