"""Baixa de novo, pelo WAHA, as fotos/vídeos/áudios que ficaram sem arquivo
no Mac (ex.: importados do histórico, ou de antes de o receptor guardar
mídia). O WhatsApp só reenvia mídia recente; as antigas continuam só com
o rótulo.

    python3 scripts/whatsapp-midias.py            # últimos 30 dias
    python3 scripts/whatsapp-midias.py --dias 7
"""
import importlib.util
import sys
import urllib.parse
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("receptor", RAIZ / "scripts" / "whatsapp-receptor.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

dias = int(sys.argv[sys.argv.index("--dias") + 1]) if "--dias" in sys.argv else 30
c = r.connect()
q = c.cursor()
q.execute("""SELECT id, chat_id, tipo, transcricao_status FROM public.whatsapp_mensagens
             WHERE midia_arquivo IS NULL AND tipo IN ('audio','imagem','video','figurinha','documento')
               AND enviada_em > now() - make_interval(days => %s)
             ORDER BY enviada_em DESC""", (dias,))
pendentes = q.fetchall()
print(f"{len(pendentes)} mídias sem arquivo nos últimos {dias} dias", flush=True)
ok = 0
for id_msg, chat_id, tipo, tstatus in pendentes:
    try:
        m = r.waha_get(f"/api/{r.SESSAO}/chats/{urllib.parse.quote(chat_id)}/messages/{urllib.parse.quote(id_msg)}?downloadMedia=true")
        media = m.get("media") or {}
        if not media.get("url"):
            continue
        dados = r.waha_get(media["url"], binario=True)
        if len(dados) > r.LIMITE_MIDIA:
            continue
        nome = r.nome_seguro(id_msg, media.get("mimetype"))
        (r.MIDIA / nome).write_bytes(dados)
        # Áudio que nunca foi transcrito entra na fila do receptor.
        novo_status = "pendente" if tipo == "audio" and tstatus in (None, "erro") else tstatus
        q.execute("UPDATE public.whatsapp_mensagens SET midia_arquivo = %s, transcricao_status = %s WHERE id = %s",
                  (nome, novo_status, id_msg))
        c.commit()
        ok += 1
    except Exception as e:
        print(f"  {id_msg[:40]}: {e!r}"[:160], flush=True)
print(f"pronto: {ok} de {len(pendentes)} baixadas")
