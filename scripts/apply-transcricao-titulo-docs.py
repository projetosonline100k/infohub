"""Nos docs de ideias (Separar ideias), troca o parágrafo "Transcrição:" em
negrito por um título h4, que fecha e abre no editor (a transcrição fica
dentro dele). Guarda o conteúdo antigo em backup antes.

    python3 scripts/apply-transcricao-titulo-docs.py <pasta_backup> <doc_id> [<doc_id> ...]
"""
import re
import sys
from pathlib import Path

from migration_db import connect

PADRAO = re.compile(r'<p>(?:<span[^>]*>)?<strong>(Transcrição(?: traduzida)?):?</strong>(?:</span>)?</p>')
backup = Path(sys.argv[1])
backup.mkdir(parents=True, exist_ok=True)
c = connect()
q = c.cursor()
for doc_id in sys.argv[2:]:
    q.execute("select titulo, conteudo from documentos where id = %s", (doc_id,))
    titulo, conteudo = q.fetchone()
    (backup / f"{doc_id}.html").write_text(conteudo)
    novo, n = PADRAO.subn(lambda m: f"<h4>{m.group(1)}</h4>", conteudo)
    q.execute("update documentos set conteudo = %s, updated_at = now() where id = %s", (novo, doc_id))
    print(f"{titulo.strip()}: {n} transcrições viraram título")
c.commit()
