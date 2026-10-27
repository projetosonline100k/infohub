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
# Mais de um número (20/10/2026): cada um tem a sua pasta (config, mídia, log) e o seu WAHA. O
# segundo receptor roda com WHATSAPP_PASTA=~/.infopro-hub/whatsapp-pessoal (config com "conta": "pessoal").
PASTA = Path(os.environ.get("WHATSAPP_PASTA") or Path.home() / ".infopro-hub" / "whatsapp").expanduser()
AUDIOS = PASTA / "audios"  # pasta antiga (só pra migrar)
AUDIOS.mkdir(parents=True, exist_ok=True)
MIDIA = PASTA / "midia"
MIDIA.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((PASTA / "config.json").read_text())
WAHA = CONFIG.get("waha_url", "http://localhost:3000")
SESSAO = CONFIG.get("sessao", "default")
CONTA = CONFIG.get("conta", "principal")


def pasta_midia(conta):
    """Mídia de cada número: o principal em ~/.infopro-hub/whatsapp/midia, os outros na pasta deles."""
    return Path.home() / ".infopro-hub" / ("whatsapp" if conta == "principal" else f"whatsapp-{conta}") / "midia"


def id_da_conta(id_msg):
    """O id do WhatsApp pode se repetir entre números (o mesmo grupo nos dois): o 2º número prefixa."""
    return id_msg if CONTA == "principal" else f"{CONTA}:{id_msg}"
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
    mid = id_da_conta(p["id"])
    c = connect()
    try:
        q = c.cursor()
        q.execute(
            """INSERT INTO public.whatsapp_mensagens
                 (id, user_id, chat_id, chat_nome, eh_grupo, autor_id, autor_nome, de_mim, tipo, texto,
                  midia_tipo, transcricao_status, responde_a, enviada_em, conta)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, to_timestamp(%s), %s)
               ON CONFLICT (id) DO NOTHING""",
            (mid, dono(), chat_id, nome_do_chat(chat_id), eh_grupo, autor, autor_nome, de_mim, tipo,
             p.get("body") or None, media.get("mimetype"),
             # Áudio antigo do histórico vem sem arquivo: fica sem transcrição.
             "pendente" if tipo == "audio" and media.get("url") else None,
             ((p.get("replyTo") or {}).get("id")), ts, CONTA),
        )
        nova = q.rowcount == 1
        c.commit()
    finally:
        c.close()
    # O WAHA apaga o arquivo da mídia depois de alguns minutos: baixa já e
    # guarda no Mac (o Jarvis mostra/toca pelo endereço /midia deste receptor).
    if nova and media.get("url") and tipo in TIPOS_COM_ARQUIVO:
        # Vídeo no grupo do Danilo vai inteiro para a pasta "Para o Danilo" (o limite de 64 MB é só da conversa).
        if CONTA == "principal" and de_mim and eh_grupo and grupo_do_danilo(nome_do_chat(chat_id)) and (media.get("mimetype") or "").startswith("video/"):
            threading.Thread(target=mandar_pro_danilo, args=(mid, media, tipo, ts), daemon=True).start()
            return
        # 20/10 (Davi: "o WhatsApp baixa todas as imagens, queria que não baixasse"): por padrão só o
        # áudio (para transcrever); foto, vídeo, figurinha e documento ficam no celular. Dá para
        # voltar a baixar algum tipo com "baixar": ["audio", "imagem", …] no config.json da conta.
        if tipo in set(CONFIG.get("baixar", ["audio"])):
            baixar_midia(mid, media, tipo)


TIPOS_COM_ARQUIVO = {"audio", "imagem", "video", "figurinha", "documento"}
LIMITE_MIDIA = 64 * 1024 * 1024  # vídeo maior que isso: abre no celular
EXTENSOES = {"audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "image/jpeg": ".jpg", "image/png": ".png",
             "image/webp": ".webp", "video/mp4": ".mp4", "application/pdf": ".pdf"}


FOTOS = PASTA / "fotos"
_trava_fotos = threading.Lock()


def foto_do_chat(chat_id):
    """Foto de perfil da pessoa/grupo (16/10: "não mostra as fotos do WhatsApp"). Guarda no Mac
    por 3 dias; sem foto, lembra disso por 1 dia (arquivo .sem) pra não perguntar toda hora."""
    nome = "".join(ch for ch in chat_id if ch.isalnum() or ch in "@._-")
    arq, sem = FOTOS / f"{nome}.jpg", FOTOS / f"{nome}.sem"
    agora = time.time()
    if arq.is_file() and agora - arq.stat().st_mtime < 3 * 86400:
        return arq
    if sem.is_file() and agora - sem.stat().st_mtime < 86400:
        return None
    with _trava_fotos:
        FOTOS.mkdir(parents=True, exist_ok=True)
        try:
            url = waha_get("/api/contacts/profile-picture?" + urllib.parse.urlencode({"contactId": chat_id, "session": "default"})).get("profilePictureURL")
            if not url:
                sem.touch()
                return arq if arq.is_file() else None
            # O Python do Mac não acha os certificados sozinho: usa o certifi do projeto.
            import ssl
            ctx = ssl.create_default_context(cafile=str(Path.home() / ".infopro-hub/py/certifi/cacert.pem"))
            with urllib.request.urlopen(url, timeout=30, context=ctx) as r:
                arq.write_bytes(r.read())
            sem.unlink(missing_ok=True)
            return arq
        except Exception as e:
            log("foto: erro", chat_id, repr(e)[:150])
            return arq if arq.is_file() else None


_nomes = {}
_trava_nomes = threading.Lock()
def nome_do_contato(contato_id):
    """Nome de quem foi marcado com @ (24/10: "esse @ que é marcado, preciso que mostre quem é"). O @ das
    contas novas é um id interno (@lid): o WAHA traduz para o número; o nome vem do contato (ou do nome
    que a pessoa usa no WhatsApp). Guarda na memória por 1 dia."""
    numero = "".join(ch for ch in contato_id.split("@")[0] if ch.isdigit())
    if not numero:
        return None
    agora = time.time()
    with _trava_nomes:
        if numero in _nomes and agora - _nomes[numero][1] < 86400:
            return _nomes[numero][0]
    # "numero": o telefone de verdade (24/10, perfil da pessoa ao clicar no nome/foto no grupo); com id @lid
    # vem do WAHA, senão é o próprio id.
    resposta = {"nome": None, "eu": False, "numero": None if contato_id.endswith("@lid") or len(numero) > 13 else numero}
    try:
        me = waha_get("/api/sessions/default/me")
        meus = {"".join(ch for ch in str(me.get(k) or "").split("@")[0] if ch.isdigit()) for k in ("id", "lid", "jid")}
        if numero in meus:
            resposta = {"nome": me.get("pushName") or "Você", "eu": True,
                        "numero": "".join(ch for ch in str(me.get("id") or "").split("@")[0] if ch.isdigit()) or None}
        else:
            pn = None
            try:
                pn = waha_get(f"/api/default/lids/{numero}@lid").get("pn")
            except Exception:
                pass
            alvo = pn or f"{numero}@c.us"
            if pn:
                resposta["numero"] = "".join(ch for ch in pn.split("@")[0] if ch.isdigit())
            c = waha_get("/api/contacts?" + urllib.parse.urlencode({"contactId": alvo, "session": "default"}))
            resposta["nome"] = c.get("name") or c.get("pushname") or c.get("shortName") or None
    except Exception as e:
        log("contato: erro", numero, repr(e)[:150])
    with _trava_nomes:
        _nomes[numero] = (resposta, agora)
    return resposta


BAIXADOS = Path.home() / "Downloads" / "WhatsApp (Infopro)"

def abrir_documento(id_msg):
    """Abre no Mac um documento que veio no WhatsApp (24/10: "queria conseguir abrir isso aqui"). Por padrão
    o receptor não baixa documento (20/10); aqui baixa na hora do clique: pede ao WAHA a mensagem com a
    mídia (vale também para os antigos), salva com o nome original em ~/Downloads/WhatsApp (Infopro) e
    abre no programa padrão. Também guarda em midia/ e o nome do arquivo na mensagem."""
    prefixo = "" if CONTA == "principal" else f"{CONTA}:"
    if prefixo and not id_msg.startswith(prefixo):
        return {"erro": "mensagem de outro número"}
    id_waha = id_msg[len(prefixo):]
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT chat_id FROM public.whatsapp_mensagens WHERE id = %s", (id_msg,))
        linha = q.fetchone()
    finally:
        c.close()
    if not linha:
        return {"erro": "mensagem não encontrada"}
    msg = waha_get(f"/api/default/chats/{urllib.parse.quote(linha[0])}/messages/{urllib.parse.quote(id_waha)}?downloadMedia=true")
    media = msg.get("media") or {}
    if not media.get("url"):
        return {"erro": "o WhatsApp não tem mais esse arquivo (abra no celular)"}
    dados = waha_get(media["url"], binario=True)
    original = Path((media.get("filename") or "").strip()).name
    ext = Path(original).suffix or EXTENSOES.get((media.get("mimetype") or "").split(";")[0].strip(), ".bin")
    nome_midia = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in id_msg)[-120:] + ext
    (MIDIA / nome_midia).write_bytes(dados)
    BAIXADOS.mkdir(parents=True, exist_ok=True)
    base = Path(original).stem if original else "Documento do WhatsApp"
    destino = BAIXADOS / f"{base}{ext}"
    k = 2
    while destino.exists() and destino.read_bytes() != dados:
        destino = BAIXADOS / f"{base} ({k}){ext}"
        k += 1
    if not destino.exists():
        destino.write_bytes(dados)
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.whatsapp_mensagens SET midia_arquivo = %s, texto = coalesce(texto, %s) WHERE id = %s",
                  (nome_midia, original or None, id_msg))
        c.commit()
    finally:
        c.close()
    if sys.platform != "darwin":
        # No servidor (27/10): não há onde abrir; o app do Mac baixa pelo /midia/ e abre lá.
        return {"ok": True, "nome": destino.name, "arquivo": nome_midia, "abrir_no_app": True}
    import subprocess
    subprocess.Popen(["open", str(destino)])
    return {"ok": True, "nome": destino.name}


def baixar_midia_no_clique(id_msg):
    """Foto/vídeo/figurinha que não veio baixada (26/10, Davi: "preciso conseguir ver as fotos, por mais que
    não baixe de forma automática"): no clique, pede ao WAHA a mídia da mensagem, guarda em midia/ e grava o
    nome na mensagem — o app passa a mostrar ali mesmo. Não abre nada no Mac."""
    prefixo = "" if CONTA == "principal" else f"{CONTA}:"
    if prefixo and not id_msg.startswith(prefixo):
        return {"erro": "mensagem de outro número"}
    id_waha = id_msg[len(prefixo):]
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT chat_id, midia_arquivo FROM public.whatsapp_mensagens WHERE id = %s", (id_msg,))
        linha = q.fetchone()
    finally:
        c.close()
    if not linha:
        return {"erro": "mensagem não encontrada"}
    if linha[1] and (MIDIA / linha[1]).exists():
        return {"ok": True, "arquivo": linha[1]}
    msg = waha_get(f"/api/{SESSAO}/chats/{urllib.parse.quote(linha[0])}/messages/{urllib.parse.quote(id_waha)}?downloadMedia=true")
    media = msg.get("media") or {}
    if not media.get("url"):
        return {"erro": "o WhatsApp não tem mais esse arquivo (abra no celular)"}
    dados = waha_get(media["url"], binario=True)
    nome_midia = nome_seguro(id_msg, media.get("mimetype"))
    (MIDIA / nome_midia).write_bytes(dados)
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.whatsapp_mensagens SET midia_arquivo = %s WHERE id = %s", (nome_midia, id_msg))
        c.commit()
    finally:
        c.close()
    return {"ok": True, "arquivo": nome_midia}


def nome_seguro(id_msg, mime):
    base = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in id_msg)[-120:]
    return base + EXTENSOES.get((mime or "").split(";")[0].strip(), ".bin")


# Vídeos mandados no grupo do Davi caem direto para o Danilo editar (pedido do Davi, 17/10/2026:
# "jogar os meus vídeos no WhatsApp, em um grupo específico, e já cair para o Danilo editar").
# O grupo: config.json "grupo_danilo" (padrão "Davi- projeto 100k"). Só os vídeos que o próprio Davi manda.
PARA_O_DANILO = Path.home() / "Desktop" / "Para o Danilo"


def grupo_do_danilo(nome):
    alvo = (CONFIG.get("grupo_danilo") or "Davi- projeto 100k").lower().replace(" ", "")
    return bool(nome) and nome.lower().replace(" ", "") == alvo


def mandar_pro_danilo(id_msg, media, tipo, ts):
    """Baixa o vídeo inteiro (sem guardar na memória) para "Para o Danilo". Enviado como Documento
    vem o original; como vídeo, o WhatsApp comprime (avisa no nome do arquivo)."""
    try:
        PARA_O_DANILO.mkdir(parents=True, exist_ok=True)
        original = (media.get("filename") or "").strip()
        ext = Path(original).suffix or EXTENSOES.get(media.get("mimetype"), ".mp4")
        quando = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H%M%S")
        base = Path(original).stem if original else f"WhatsApp {quando}"
        if tipo == "video":
            base += " (comprimido pelo WhatsApp)"
        destino = PARA_O_DANILO / f"{base}{ext}"
        k = 2
        while destino.exists():
            destino = PARA_O_DANILO / f"{base} {k}{ext}"
            k += 1
        parcial = destino.with_suffix(destino.suffix + ".baixando")   # o Danilo não pega enquanto baixa
        url = media["url"]
        req = urllib.request.Request(url if url.startswith("http") else WAHA + url, headers={"X-Api-Key": CONFIG["waha_api_key"]})
        with urllib.request.urlopen(req, timeout=600) as r, open(parcial, "wb") as f:
            while True:
                bloco = r.read(8 * 1024 * 1024)
                if not bloco:
                    break
                f.write(bloco)
        parcial.rename(destino)
        log("danilo: vídeo do WhatsApp na pasta", destino.name, f"{destino.stat().st_size // (1024 * 1024)} MB")
    except Exception as e:
        log("danilo: não consegui baixar o vídeo do grupo", id_msg, repr(e)[:200])


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


class _TravaPesada:
    """Um trabalho pesado por vez no Mac de 8 GB (20/10/2026: o Whisper daqui e o do Danilo juntos
    passavam de 9 GB e cada áudio levava 5 min): a mesma trava de arquivo do Danilo (danilo.pesado)."""
    def __enter__(self):
        import fcntl
        caminho = Path.home() / ".infopro-hub" / "danilo" / "pesado.lock"
        caminho.parent.mkdir(parents=True, exist_ok=True)
        self.f = open(caminho, "w")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_):
        import fcntl
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


class _Whisper:
    """Transcrição: no Mac, mlx-whisper (chip da Apple); no servidor Linux (27/10, migração para a VPS),
    faster-whisper no processador (int8), com o mesmo modelo large-v3-turbo."""
    def __init__(self):
        self.mlx = None
        self.fw = None
        if sys.platform == "darwin":
            import mlx_whisper
            self.mlx = mlx_whisper

    def transcrever(self, caminho):
        if self.mlx:
            return self.mlx.transcribe(caminho, path_or_hf_repo=MODELO, verbose=None, language="pt").get("text") or ""
        if self.fw is None:
            from faster_whisper import WhisperModel
            self.fw = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
        partes, _ = self.fw.transcribe(caminho, language="pt", vad_filter=True)
        return " ".join(p.text.strip() for p in partes)

    def soltar(self):
        """Tira o Whisper da memória (~2–4 GB) quando a fila acaba; carrega de novo no próximo áudio."""
        import gc
        try:
            if self.mlx:
                self.mlx.transcribe.ModelHolder.model = None
                self.mlx.transcribe.ModelHolder.model_path = None
                gc.collect()
                import mlx.core as mx
                mx.clear_cache()
            else:
                self.fw = None
                gc.collect()
        except Exception as e:
            log("transcrição: não consegui soltar o modelo —", repr(e)[:120])


def transcritor():
    """Um áudio por vez (o Mac do Davi tem 8 GB). O modelo carrega no
    primeiro áudio e fica na memória. O arquivo fica guardado (pra ouvir)."""
    sys.path.insert(0, str(Path.home() / ".infopro-hub" / "creator"))
    os.environ["PATH"] = str(Path.home() / ".infopro-hub" / "creator-bin") + os.pathsep + os.environ.get("PATH", "")
    whisper = _Whisper()
    migrar_audios_antigos()
    while True:
        _acordar.wait(timeout=60)
        _acordar.clear()
        # 19/10: uma queda do banco ("network error", "max clients reached") matava esta thread e os
        # áudios ficavam "transcrevendo…" para sempre. Agora espera e tenta de novo na próxima volta.
        try:
            c = connect()
            try:
                q = c.cursor()
                # Um só Whisper no Mac (8 GB): o receptor principal transcreve os áudios de todos os números.
                q.execute("""SELECT id, midia_arquivo, conta FROM public.whatsapp_mensagens
                             WHERE transcricao_status IN ('pendente', 'transcrevendo') AND midia_arquivo IS NOT NULL
                             ORDER BY enviada_em DESC""")
                fila = q.fetchall()
            finally:
                c.close()
        except Exception as e:
            log("transcrição: banco fora, tento de novo em 1 min —", repr(e)[:150])
            continue
        if not fila:
            continue
        with _TravaPesada():
            _transcrever_fila(whisper, fila)
        whisper.soltar()


def _transcrever_fila(whisper, fila):
    for id_msg, nome, conta in fila:
        arq = pasta_midia(conta) / nome
        if not arq.exists():
            try:
                marcar(id_msg, "erro")
            except Exception:
                pass
            continue
        try:
            marcar(id_msg, "transcrevendo")
            inicio = time.time()
            # Português fixo: áudio curto fazia o Whisper "adivinhar" outro idioma
            # (um "teste, teste" virou "Tæk, tæk" em 13/10).
            texto = whisper.transcrever(str(arq))
            marcar(id_msg, "pronta", texto.strip() or "(áudio sem fala)")
            log("audio transcrito em", f"{time.time() - inicio:.1f}s")
        except Exception as e:
            log("audio: erro", repr(e)[:200])
            try:
                marcar(id_msg, "erro")
            except Exception:   # banco fora: fica 'transcrevendo' e a próxima volta tenta de novo
                pass


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
        if consulta.get("k", [""])[0] != CONFIG["segredo_webhook"] or not url.path.startswith(("/midia/", "/foto/", "/contato/", "/abrir/", "/baixar/")):
            self.send_response(403); self.end_headers(); return
        if url.path.startswith(("/abrir/", "/baixar/")):
            baixar = url.path.startswith("/baixar/")
            try:
                ident = urllib.parse.unquote(url.path[len("/baixar/" if baixar else "/abrir/"):])
                resposta = baixar_midia_no_clique(ident) if baixar else abrir_documento(ident)
            except Exception as e:
                log("abrir: erro", repr(e)[:200])
                resposta = {"erro": "não consegui baixar o arquivo"}
            dados = json.dumps(resposta).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(dados)
            return
        if url.path.startswith("/contato/"):
            dados = json.dumps(nome_do_contato(urllib.parse.unquote(url.path[len("/contato/"):])) or {"nome": None}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(dados)
            return
        if url.path.startswith("/foto/"):
            arq = foto_do_chat(urllib.parse.unquote(url.path[len("/foto/"):]))
            if not arq:
                self.send_response(404); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); return
            dados = arq.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(dados)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "private, max-age=86400")
            self.end_headers()
            try:
                self.wfile.write(dados)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
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
    if CONFIG.get("transcrever", CONTA == "principal"):
        threading.Thread(target=transcritor, daemon=True).start()
    porta = int(CONFIG.get("porta", 3101))
    log("receptor iniciado na porta", porta)
    ThreadingHTTPServer(("0.0.0.0", porta), Webhook).serve_forever()
