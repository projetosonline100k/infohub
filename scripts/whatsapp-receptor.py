"""Receptor do WhatsApp: o WAHA (rodando no Mac, no Docker/Colima) manda cada
mensagem pra cá por webhook; ela vai pra tabela whatsapp_mensagens e, se for
áudio, entra na fila de transcrição (Whisper no Mac, um por vez). Só lê:
nada aqui envia mensagem.

Roda como LaunchAgent (scripts/instalar-whatsapp.sh). Config em
~/.infopro-hub/whatsapp/config.json (porta, segredo do webhook, chave da API
do WAHA). Log em ~/.infopro-hub/whatsapp/receptor.log.

    python3 scripts/whatsapp-receptor.py
"""
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

EMAIL = "eu.daviqueiroz22@gmail.com"  # conta admin do app (src/lib/admin.ts)
PASTA = Path.home() / ".infopro-hub" / "whatsapp"
AUDIOS = PASTA / "audios"  # pasta antiga (só pra migrar)
AUDIOS.mkdir(parents=True, exist_ok=True)
MIDIA = PASTA / "midia"
MIDIA.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((PASTA / "config.json").read_text())
WAHA = CONFIG.get("waha_url", "http://localhost:3000")
SESSAO = CONFIG.get("sessao", "default")
MODELO = "mlx-community/whisper-large-v3-turbo"
_trava_log = threading.Lock()


def log(*partes):
    linha = f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(str(p) for p in partes)
    with _trava_log, open(PASTA / "receptor.log", "a") as f:
        f.write(linha + "\n")


def waha_get(caminho, binario=False):
    req = urllib.request.Request(caminho if caminho.startswith("http") else WAHA + caminho,
                                 headers={"X-Api-Key": CONFIG["waha_api_key"]})
    with urllib.request.urlopen(req, timeout=60) as r:
        dados = r.read()
    return dados if binario else json.loads(dados)


_dono = None
def dono():
    global _dono
    if not _dono:
        c = connect()
        q = c.cursor()
        q.execute("SELECT id FROM auth.users WHERE lower(email) = %s", (EMAIL,))
        _dono = q.fetchone()[0]
        c.close()
    return _dono


# O WhatsApp agora manda "lid" (código interno, ex. 9093...@lid) no lugar do
# telefone. Converte pro telefone (5511...@c.us), pra mesma pessoa ser uma
# conversa só e o nome aparecer.
_telefones = {}
def normalizar(jid):
    if not jid or not jid.endswith("@lid"):
        return jid
    if jid not in _telefones:
        try:
            _telefones[jid] = waha_get(f"/api/{SESSAO}/lids/{urllib.parse.quote(jid)}").get("pn") or jid
        except Exception:
            return jid  # tenta de novo na próxima
    return _telefones[jid]


# Nomes de grupos e contatos (o webhook só traz o id).
_nomes = {}
def nome_do_chat(chat_id):
    if not chat_id:
        return None
    if chat_id in _nomes:
        return _nomes[chat_id]
    nome = None
    try:
        if chat_id.endswith("@g.us"):
            g = waha_get(f"/api/{SESSAO}/groups/{urllib.parse.quote(chat_id)}")
            nome = g.get("subject") or g.get("Name") or g.get("name")  # GOWS usa "Name"
        else:
            c = waha_get(f"/api/contacts?contactId={urllib.parse.quote(chat_id)}&session={SESSAO}")
            nome = c.get("name") or c.get("pushname")
    except Exception:
        pass
    if nome:
        _nomes[chat_id] = nome
    return nome


TIPOS = {"chat": "texto", "ptt": "audio", "audio": "audio", "image": "imagem", "video": "video",
         "document": "documento", "sticker": "figurinha"}


def tipo_da_mensagem(p):
    mime = ((p.get("media") or {}).get("mimetype") or "")
    if mime.startswith("audio/"):
        return "audio"
    bruto = (p.get("_data") or {})
    t = bruto.get("type") or (bruto.get("Info") or {}).get("Type") or ""
    if p.get("hasMedia"):
        if mime.startswith("image/"):
            return "imagem"
        if mime.startswith("video/"):
            return "video"
        return TIPOS.get(t, "documento")
    return TIPOS.get(t, "texto")


def chat_do_id(id_msg):
    """O id da mensagem diz a conversa: "true_<chat>_<msg>[_<autor>]". É a
    fonte certa — nas mensagens do próprio Davi o "to" às vezes vem com o
    número dele (13/10: respostas a mentorados caíam na conversa "Davi")."""
    partes = (id_msg or "").split("_")
    if len(partes) >= 3 and partes[0] in ("true", "false") and "@" in partes[1]:
        return partes[1]
    return None


def guardar(p):
    de_mim = bool(p.get("fromMe"))
    chat_id = normalizar(chat_do_id(p.get("id")) or (p.get("to") if de_mim else p.get("from")))
    if not chat_id or chat_id == "status@broadcast":
        return
    eh_grupo = chat_id.endswith("@g.us")
    autor = normalizar(p.get("participant") or p.get("author") or (None if eh_grupo else chat_id)) if not de_mim else "eu"
    bruto = p.get("_data") or {}
    autor_nome = "Davi" if de_mim else (bruto.get("notifyName") or bruto.get("pushName") or (bruto.get("Info") or {}).get("PushName")
                                        or nome_do_chat(autor))
    tipo = tipo_da_mensagem(p)
    ts = p.get("timestamp") or time.time()
    media = p.get("media") or {}
    c = connect()
    try:
        q = c.cursor()
        q.execute(
            """INSERT INTO public.whatsapp_mensagens
                 (id, user_id, chat_id, chat_nome, eh_grupo, autor_id, autor_nome, de_mim, tipo, texto,
                  midia_tipo, transcricao_status, responde_a, enviada_em)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, to_timestamp(%s))
               ON CONFLICT (id) DO NOTHING""",
            (p["id"], dono(), chat_id, nome_do_chat(chat_id), eh_grupo, autor, autor_nome, de_mim, tipo,
             p.get("body") or None, media.get("mimetype"),
             # Áudio antigo do histórico vem sem arquivo: fica sem transcrição.
             "pendente" if tipo == "audio" and media.get("url") else None,
             ((p.get("replyTo") or {}).get("id")), ts),
        )
        nova = q.rowcount == 1
        c.commit()
    finally:
        c.close()
    # O WAHA apaga o arquivo da mídia depois de alguns minutos: baixa já e
    # guarda no Mac (o Jarvis mostra/toca pelo endereço /midia deste receptor).
    if nova and media.get("url") and tipo in TIPOS_COM_ARQUIVO:
        baixar_midia(p["id"], media, tipo)


TIPOS_COM_ARQUIVO = {"audio", "imagem", "video", "figurinha", "documento"}
LIMITE_MIDIA = 64 * 1024 * 1024  # vídeo maior que isso: abre no celular
EXTENSOES = {"audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "image/jpeg": ".jpg", "image/png": ".png",
             "image/webp": ".webp", "video/mp4": ".mp4", "application/pdf": ".pdf"}


def nome_seguro(id_msg, mime):
    base = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in id_msg)[-120:]
    return base + EXTENSOES.get((mime or "").split(";")[0].strip(), ".bin")


def baixar_midia(id_msg, media, tipo):
    try:
        dados = waha_get(media["url"], binario=True)
        if len(dados) > LIMITE_MIDIA:
            return
        nome = nome_seguro(id_msg, media.get("mimetype"))
        (MIDIA / nome).write_bytes(dados)
        c = connect()
        try:
            q = c.cursor()
            q.execute("UPDATE public.whatsapp_mensagens SET midia_arquivo = %s WHERE id = %s", (nome, id_msg))
            c.commit()
        finally:
            c.close()
        if tipo == "audio":
            _acordar.set()
    except Exception as e:
        log("midia: não baixei", id_msg, repr(e)[:200])
        if tipo == "audio":
            marcar(id_msg, "erro")


def marcar(id_msg, status, texto=None):
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.whatsapp_mensagens SET transcricao_status = %s, transcricao = coalesce(%s, transcricao) WHERE id = %s",
                  (status, texto, id_msg))
        c.commit()
    finally:
        c.close()


# ------------------------------------------------------------ transcrição

_acordar = threading.Event()


def migrar_audios_antigos():
    """Áudios da pasta antiga (antes de guardar mídia): passam pra midia/."""
    antigos = list(AUDIOS.glob("*.audio"))
    if not antigos:
        return
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT id FROM public.whatsapp_mensagens WHERE tipo = 'audio' AND midia_arquivo IS NULL")
        por_nome = {"".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in r[0]) + ".audio": r[0] for r in q.fetchall()}
        for arq in antigos:
            id_msg = por_nome.get(arq.name)
            if not id_msg:
                arq.unlink(missing_ok=True)
                continue
            nome = nome_seguro(id_msg, "audio/ogg")
            arq.rename(MIDIA / nome)
            q.execute("UPDATE public.whatsapp_mensagens SET midia_arquivo = %s WHERE id = %s", (nome, id_msg))
        c.commit()
    finally:
        c.close()


def transcritor():
    """Um áudio por vez (o Mac do Davi tem 8 GB). O modelo carrega no
    primeiro áudio e fica na memória. O arquivo fica guardado (pra ouvir)."""
    sys.path.insert(0, str(Path.home() / ".infopro-hub" / "creator"))
    os.environ["PATH"] = str(Path.home() / ".infopro-hub" / "creator-bin") + os.pathsep + os.environ.get("PATH", "")
    import mlx_whisper
    migrar_audios_antigos()
    while True:
        _acordar.wait(timeout=60)
        _acordar.clear()
        c = connect()
        q = c.cursor()
        q.execute("""SELECT id, midia_arquivo FROM public.whatsapp_mensagens
                     WHERE transcricao_status = 'pendente' AND midia_arquivo IS NOT NULL ORDER BY enviada_em DESC""")
        fila = q.fetchall()
        c.close()
        for id_msg, nome in fila:
            arq = MIDIA / nome
            if not arq.exists():
                marcar(id_msg, "erro")
                continue
            try:
                marcar(id_msg, "transcrevendo")
                inicio = time.time()
                # Português fixo: áudio curto fazia o Whisper "adivinhar" outro idioma
                # (um "teste, teste" virou "Tæk, tæk" em 13/10).
                r = mlx_whisper.transcribe(str(arq), path_or_hf_repo=MODELO, verbose=None, language="pt")
                marcar(id_msg, "pronta", (r.get("text") or "").strip() or "(áudio sem fala)")
                log("audio transcrito em", f"{time.time() - inicio:.1f}s")
            except Exception as e:
                marcar(id_msg, "erro")
                log("audio: erro", repr(e)[:200])


# ------------------------------------------------------------ webhook

class Webhook(BaseHTTPRequestHandler):
    def do_POST(self):
        consulta = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if consulta.get("k", [""])[0] != CONFIG["segredo_webhook"]:
            self.send_response(403); self.end_headers(); return
        corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.send_response(200); self.end_headers()
        try:
            evento = json.loads(corpo)
            if evento.get("event") in ("message", "message.any") and evento.get("payload", {}).get("id"):
                guardar(evento["payload"])
        except Exception as e:
            log("webhook: erro", repr(e)[:300])

    def do_GET(self):
        """Mídia pro Jarvis: /midia/<arquivo>?k=<segredo>. Aceita Range (o
        player de vídeo/áudio do app pede pedaços)."""
        url = urllib.parse.urlparse(self.path)
        consulta = urllib.parse.parse_qs(url.query)
        if consulta.get("k", [""])[0] != CONFIG["segredo_webhook"] or not url.path.startswith("/midia/"):
            self.send_response(403); self.end_headers(); return
        nome = Path(urllib.parse.unquote(url.path[len("/midia/"):])).name  # sem subir de pasta
        arq = MIDIA / nome
        if not nome or not arq.is_file():
            self.send_response(404); self.end_headers(); return
        tamanho = arq.stat().st_size
        tipo = {v: k for k, v in EXTENSOES.items()}.get(arq.suffix, "application/octet-stream")
        inicio, fim = 0, tamanho - 1
        faixa = self.headers.get("Range")
        if faixa and faixa.startswith("bytes="):
            a, _, b = faixa[6:].partition("-")
            inicio = int(a) if a else 0
            fim = min(int(b), tamanho - 1) if b else tamanho - 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {inicio}-{fim}/{tamanho}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fim - inicio + 1))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "private, max-age=86400")
        self.end_headers()
        with open(arq, "rb") as f:
            f.seek(inicio)
            restante = fim - inicio + 1
            while restante > 0:
                bloco = f.read(min(65536, restante))
                if not bloco:
                    break
                try:
                    self.wfile.write(bloco)
                except (BrokenPipeError, ConnectionResetError):
                    return
                restante -= len(bloco)

    def log_message(self, *_):  # sem log de cada requisição
        pass


if __name__ == "__main__":
    threading.Thread(target=transcritor, daemon=True).start()
    porta = int(CONFIG.get("porta", 3101))
    log("receptor iniciado na porta", porta)
    ThreadingHTTPServer(("0.0.0.0", porta), Webhook).serve_forever()
