"""Lê o WhatsApp do banco (whatsapp_mensagens, alimentado pelo WAHA) pra
atualizar o painel de mentorados — substitui ler o WhatsApp Web pelo Chrome.
Imprime, por conversa, as mensagens desde a última atualização do painel
(com os áudios já transcritos), da mais recente pra mais antiga.

    python3 scripts/whatsapp-ler.py                 # desde a última atualização do painel
    python3 scripts/whatsapp-ler.py --horas 48      # janela fixa
    python3 scripts/whatsapp-ler.py --chat "Marcela" # uma conversa (nome contém), 30 dias

Antes de ler, espera (até 5 min) os áudios que ainda estão sendo transcritos.
Se o WAHA estiver desconectado, avisa no topo (aí o jeito é o WhatsApp Web).
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

EMAIL = "eu.daviqueiroz22@gmail.com"
FUSO = timezone(timedelta(hours=-3))


def arg(nome, padrao=None):
    return sys.argv[sys.argv.index(nome) + 1] if nome in sys.argv else padrao


def status_waha():
    try:
        cfg = json.loads((Path.home() / ".infopro-hub/whatsapp/config.json").read_text())
        req = urllib.request.Request(cfg["waha_url"] + f"/api/sessions/{cfg['sessao']}", headers={"X-Api-Key": cfg["waha_api_key"]})
        return json.loads(urllib.request.urlopen(req, timeout=5).read()).get("status")
    except Exception as e:
        return f"inacessível ({e.__class__.__name__})"


c = connect()
q = c.cursor()
q.execute("SELECT id FROM auth.users WHERE lower(email) = %s", (EMAIL,))
uid = q.fetchone()[0]

chat = arg("--chat")
if arg("--horas"):
    desde = datetime.now(timezone.utc) - timedelta(hours=float(arg("--horas")))
elif chat:
    desde = datetime.now(timezone.utc) - timedelta(days=30)
else:
    q.execute("SELECT atualizado_em FROM public.whatsapp_painel WHERE user_id = %s", (uid,))
    row = q.fetchone()
    # Uma margem de 2h antes da última atualização, pra não perder nada.
    desde = (row[0] - timedelta(hours=2)) if row and row[0] else datetime.now(timezone.utc) - timedelta(days=3)

# Espera os áudios pendentes (o receptor transcreve um por vez).
for _ in range(60):
    q.execute("""SELECT count(*) FROM public.whatsapp_mensagens
                 WHERE user_id = %s AND enviada_em >= %s AND transcricao_status IN ('pendente', 'transcrevendo')""", (uid, desde))
    if q.fetchone()[0] == 0:
        break
    c.commit()
    time.sleep(5)

q.execute("""SELECT chat_id, chat_nome, eh_grupo, de_mim, autor_nome, autor_id, tipo, texto, transcricao,
                    transcricao_status, enviada_em
             FROM public.whatsapp_mensagens
             WHERE user_id = %s AND enviada_em >= %s AND (%s::text IS NULL OR chat_nome ILIKE '%%' || %s || '%%')
             ORDER BY enviada_em""", (uid, desde, chat, chat))
linhas = q.fetchall()
c.close()

conversas = {}
for r in linhas:
    conversas.setdefault(r[0], []).append(r)

print(f"WAHA: {status_waha()} · mensagens desde {desde.astimezone(FUSO):%d/%m %H:%M} · {len(linhas)} mensagens em {len(conversas)} conversas")
print("(Só leitura. Nunca responda pelo WhatsApp.)\n")
# Conversa com atividade mais recente primeiro.
for chat_id, msgs in sorted(conversas.items(), key=lambda kv: kv[1][-1][10], reverse=True):
    nome, eh_grupo = msgs[0][1] or chat_id, msgs[0][2]
    ultima_minha = msgs[-1][3]
    print(f"=== {nome} {'(grupo)' if eh_grupo else '(privado)'} · {chat_id}"
          f" · última: {'Davi' if ultima_minha else 'ELE(A)'} às {msgs[-1][10].astimezone(FUSO):%d/%m %H:%M}")
    for (_, _, _, de_mim, autor_nome, autor_id, tipo, texto, transcricao, tstatus, quando) in msgs:
        quem = "Davi" if de_mim else (autor_nome or (autor_id or "").split("@")[0] or "?")
        if tipo == "audio":
            conteudo = f"[áudio] {transcricao}" if transcricao else f"[áudio — transcrição {tstatus or 'indisponível'}]"
        elif tipo == "texto":
            conteudo = texto or ""
        else:
            conteudo = f"[{tipo}] {texto or ''}".strip()
        print(f"  {quando.astimezone(FUSO):%d/%m %H:%M} {quem}: {conteudo}")
    print()
