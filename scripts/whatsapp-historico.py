"""Puxa o histórico recente do WhatsApp (via WAHA) pra whatsapp_mensagens —
o receptor só pega o que chega depois de conectar. Os áudios entram na
mesma fila de transcrição do receptor (pasta ~/.infopro-hub/whatsapp/audios,
que ele confere a cada minuto). Mensagem repetida é ignorada.

    python3 scripts/whatsapp-historico.py            # últimos 7 dias
    python3 scripts/whatsapp-historico.py --dias 3
    python3 scripts/whatsapp-historico.py --todas    # TODAS as conversas (últimas 200
                                                     # mensagens de cada); áudios só
                                                     # dos últimos 7 dias são baixados
"""
import importlib.util
import sys
import time
import urllib.parse
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("receptor", RAIZ / "scripts" / "whatsapp-receptor.py")
receptor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receptor)

todas = "--todas" in sys.argv
dias = int(sys.argv[sys.argv.index("--dias") + 1]) if "--dias" in sys.argv else 7
desde = 0 if todas else int(time.time()) - dias * 86400
recente = int(time.time()) - 7 * 86400  # áudio mais antigo que isso não é baixado
S = receptor.SESSAO

# Conversas com atividade no período (a lista vem da mais recente pra mais antiga).
chats, offset = [], 0
while True:
    pagina = receptor.waha_get(f"/api/{S}/chats/overview?limit=100&offset={offset}")
    if not pagina:
        break
    for c in pagina:
        ts = (c.get("lastMessage") or {}).get("timestamp") or 0
        if ts >= desde and c.get("id") != "status@broadcast":
            chats.append(c)
    if (pagina[-1].get("lastMessage") or {}).get("timestamp", 0) < desde or len(pagina) < 100:
        break
    offset += 100
print(f"{len(chats)} conversas" + ("" if todas else f" com atividade nos últimos {dias} dias"), flush=True)

total = audios = 0
for i, c in enumerate(chats, 1):
    if c.get("name"):
        receptor._nomes[c["id"]] = c["name"]
    try:
        base = f"/api/{S}/chats/{urllib.parse.quote(c['id'])}/messages"
        if todas:
            # Recentes com mídia (pra transcrever) + o resto só o texto.
            msgs = receptor.waha_get(f"{base}?limit=200&downloadMedia=true&filter.timestamp.gte={recente}")
            vistos = {m.get("id") for m in msgs}
            msgs += [m for m in receptor.waha_get(f"{base}?limit=200&downloadMedia=false") if m.get("id") not in vistos]
        else:
            msgs = receptor.waha_get(f"{base}?limit=300&downloadMedia=true&filter.timestamp.gte={desde}")
    except Exception as e:
        print(f"  {c.get('name') or c['id']}: erro {e!r}"[:200], flush=True)
        continue
    for m in sorted(msgs, key=lambda m: m.get("timestamp") or 0):
        try:
            receptor.guardar(m)
            total += 1
            audios += receptor.tipo_da_mensagem(m) == "audio"
        except Exception as e:
            print(f"  mensagem ignorada: {e!r}"[:200], flush=True)
    print(f"[{i}/{len(chats)}] {c.get('name') or c['id']}: {len(msgs)} mensagens", flush=True)
print(f"pronto: {total} mensagens conferidas ({audios} áudios na fila de transcrição)")
