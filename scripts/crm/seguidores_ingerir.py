"""Põe no CRM (etapa "Novo seguidor") os seguidores lidos da lista do Instagram. Lê os @ da entrada padrão, um por linha,
do MAIS NOVO para o mais antigo (a ordem da lista do Instagram). Quem já está no CRM não é mexido.
Uso:  python3 scripts/crm/seguidores_ingerir.py <<'FIM'
          fulano
          beltrano
      FIM
A conta, o projeto e a quantidade diária ficam em scripts/crm/seguidores.json (é aí que se aumenta o número)."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migration_db import connect  # noqa: E402

cfg = json.loads((Path(__file__).with_name("seguidores.json")).read_text())
if "--config" in sys.argv:
    print(json.dumps(cfg))
    sys.exit(0)

usuarios, vistos = [], set()
for linha in sys.stdin.read().split():
    u = linha.strip().lower().lstrip("@")
    if re.fullmatch(r"[a-z0-9._]{1,30}", u) and u not in vistos:
        vistos.add(u)
        usuarios.append(u)
if not usuarios:
    print("nenhum @ válido na entrada")
    sys.exit(1)

c = connect()
q = c.cursor()
cid = cfg["cliente_id"]
q.execute("select count(*) from crm_pessoas where cliente_id=%s", (cid,))
antes = q.fetchone()[0]
for u in reversed(usuarios):   # do mais antigo ao mais novo, para a ordem da fila ficar certa
    q.execute("select crm_registrar(%s,NULL,NULL,NULL,%s,'seguidor','seguidor',NULL,NULL,NULL,now())", (cid, u))
q.execute("select count(*) from crm_pessoas where cliente_id=%s", (cid,))
depois = q.fetchone()[0]
c.commit()
print(f"lidos {len(usuarios)} · novos no CRM {depois - antes} · já estavam {len(usuarios) - (depois - antes)}")
