"""Serviço local do Danilo (editor IA): o Infopro (app do Mac) fala com ele
pra mostrar o vídeo, salvar o que o Davi mudou no mini editor, gerar nova
versão e, ao aprovar, entregar no Drive. Roda como LaunchAgent
(scripts/danilo/instalar.sh). Só aceita pedidos com a chave do config.

Edições ficam em ~/.infopro-hub/danilo/edicoes/<id>/ (bruto.*, projeto.json,
previa.mp4, final.mp4, midias/, entrega.json). O andamento vai pra tabela
edicoes_video (o Infopro mostra ao vivo).

  GET  /edicoes/<id>/projeto
  POST /edicoes/<id>/projeto          (JSON do projeto) → salva e gera prévia
  GET  /edicoes/<id>/arquivo/<nome>   (previa.mp4, final.mp4, midias/…) com Range
  POST /edicoes/<id>/midia?nome=x     (bytes) → guarda imagem/vídeo/música
  POST /edicoes/<id>/aprovar          → versão final, entrega no Drive, avança a tarefa
"""
import json
import os
import secrets
import shutil
import sys
import threading
import traceback
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts"))
sys.path.insert(0, str(Path(__file__).parent))
from migration_db import connect  # noqa: E402
import motor  # noqa: E402

BASE = Path.home() / ".infopro-hub" / "danilo"
EDICOES = BASE / "edicoes"
EDICOES.mkdir(parents=True, exist_ok=True)
CFG_ARQ = BASE / "config.json"
if not CFG_ARQ.exists():
    CFG_ARQ.write_text(json.dumps({"porta": 3103, "chave": secrets.token_hex(16)}))
    CFG_ARQ.chmod(0o600)
CFG = json.loads(CFG_ARQ.read_text())
TIPOS = {".mp4": "video/mp4", ".mov": "video/quicktime", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".png": "image/png", ".webp": "image/webp", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
         ".wav": "audio/wav", ".json": "application/json"}
_fila = threading.Lock()  # uma montagem por vez (o Mac tem 8 GB)


def log(*p):
    with open(BASE / "servidor.log", "a") as f:
        f.write(f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(map(str, p)) + "\n")


def db(sql, args=()):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        linhas = q.fetchall() if q.description else None
        c.commit()
        return linhas
    finally:
        c.close()


def status(id_, st, msg=None, **campos):
    extra = "".join(f", {k} = %s" for k in campos)
    db(f"UPDATE public.edicoes_video SET status = %s, mensagem = %s, atualizado_em = now(){extra} WHERE id = %s",
       (st, msg, *campos.values(), id_))


def pasta_de(id_):
    p = (EDICOES / id_).resolve()
    if p.parent != EDICOES.resolve() or not (p / "projeto.json").exists():
        raise FileNotFoundError(id_)
    return p


# ---------------------------------------------------------------- tarefas longas
def andamento(id_, texto):
    """progresso(fração) do motor → mensagem "texto 45% · falta ~1 min" (o
    editor mostra ao vivo), no máximo a cada 3 s."""
    import time
    inicio, ultimo = time.time(), [0.0]

    def cb(f):
        agora = time.time()
        if agora - ultimo[0] < 3 or f <= 0:
            return
        ultimo[0] = agora
        falta = (agora - inicio) * (1 - f) / f
        resto = f"{int(falta)} s" if falta < 90 else f"{round(falta / 60)} min"
        db("UPDATE public.edicoes_video SET mensagem = %s, atualizado_em = now() WHERE id = %s",
           (f"{texto} {int(f * 100)}% · falta ~{resto}", id_))
    return cb


def gerar_previa(id_):
    with _fila:
        try:
            if not (pasta_de(id_) / "proxy.mp4").exists():
                status(id_, "renderizando", "Preparando a cópia leve do vídeo…")
                while pasta_de(id_) in _gerando_proxy:     # o player já está gerando: espera
                    __import__("time").sleep(2)
                fazer_proxy(pasta_de(id_))
            status(id_, "renderizando", "Gerando a nova versão…")
            _, dur = motor.renderizar(pasta_de(id_), previa=True, progresso=andamento(id_, "Gerando a nova versão…"))
            db("UPDATE public.edicoes_video SET status = 'revisar', mensagem = null, duracao = %s, versao = versao + 1, "
               "atualizado_em = now() WHERE id = %s", (round(dur, 1), id_))
            log("prévia ok", id_)
        except Exception as e:
            log("prévia erro", id_, traceback.format_exc()[-400:])
            status(id_, "erro", f"Não consegui gerar a versão: {str(e)[:200]}")


def aprovar(id_):
    with _fila:
        try:
            pasta = pasta_de(id_)
            status(id_, "aprovando", "Gerando a versão final em Full HD…")
            final, dur = motor.renderizar(pasta, previa=False, progresso=andamento(id_, "Gerando o Full HD…"))
            entrega = json.loads((pasta / "entrega.json").read_text()) if (pasta / "entrega.json").exists() else {}
            destino_txt = None
            # Sem entrega no Drive não é "aprovado": o final é o original do post da Dalila.
            if not (entrega.get("destino_dir") and Path(entrega["destino_dir"]).is_dir()):
                raise RuntimeError(f"pasta de entrega do Drive não encontrada ({entrega.get('destino_dir') or 'sem entrega.json'})")
            status(id_, "aprovando", "Enviando pro Drive…")
            destino = Path(entrega["destino_dir"]) / f"{entrega.get('nome_final') or id_}.mp4"
            shutil.copyfile(final, destino)
            destino_txt = str(destino)
            bruto = Path(entrega.get("bruto_drive") or "")
            if bruto.exists() and not bruto.name.startswith("[EDITADO]"):
                nome = bruto.name.replace("[EM EDIÇÃO] ", "")
                bruto.rename(bruto.with_name(f"[EDITADO] {nome}"))
            # Avança o fluxo: tarefa do Danilo concluída, vídeo → "pronto"
            # (as automações por etapa passam pra quem programa).
            linha = db("SELECT atividade_id, video_vertical_id, cliente_id FROM public.edicoes_video WHERE id = %s", (id_,))[0]
            if linha[0]:
                db("""UPDATE public.atividades a SET situacao = 'concluida', concluida = true,
                        status = coalesce((SELECT status_key FROM public.colunas_atividade c
                                           WHERE c.cliente_id = a.cliente_id AND c.eh_conclusao ORDER BY ordem LIMIT 1), a.status)
                      WHERE id = %s""", (linha[0],))
            if linha[1]:
                db("UPDATE public.videos_vertical SET status = 'pronto' WHERE id = %s AND status IN ('gravacao', 'edicao')", (linha[1],))
            status(id_, "aprovado", None, final_drive=destino_txt, duracao=round(dur, 1))
            log("aprovado", id_, destino_txt)
        except Exception as e:
            log("aprovar erro", id_, traceback.format_exc()[-400:])
            status(id_, "erro", f"Não consegui finalizar: {str(e)[:200]}")


_gerando_proxy = set()


def fazer_proxy(pasta):
    """Gera o proxy.mp4 (540×960, quadro-chave a cada 1/3 s). Também é a fonte
    da prévia montada pelo motor. Decodifica o bruto no hardware (VideoToolbox)."""
    import subprocess
    destino = pasta / "proxy.mp4"
    if destino.exists():
        return destino
    projeto = json.loads((pasta / "projeto.json").read_text())
    tmp = pasta / "proxy.mp4.tmp"
    subprocess.run([motor.FF, "-hide_banner", "-loglevel", "error", "-y", "-hwaccel", "videotoolbox", "-i", projeto["fonte"],
                    "-map", "0:v:0", "-map", "0:a:0?",
                    "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,format=yuv420p",
                    "-r", "30", "-fps_mode", "cfr",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "10", "-bf", "0",
                    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", "-f", "mp4", str(tmp)], check=True)
    tmp.replace(destino)
    return destino


def proxy(pasta):
    """Cópia leve do bruto só pro mini editor tocar liso (como o proxy do
    Premiere): 540×960 H.264 com quadro-chave a cada 1/3 s, então pular os
    cortes é instantâneo (o bruto HEVC 1080p trava pra achar o ponto).
    Gera em segundo plano (~20 s) na primeira vez; o render final continua
    usando o bruto original."""
    destino = pasta / "proxy.mp4"
    if destino.exists():
        return {"pronto": True, "arquivo": "proxy.mp4"}
    if pasta not in _gerando_proxy:
        _gerando_proxy.add(pasta)

        def gerar():
            try:
                fazer_proxy(pasta)
            except Exception:
                traceback.print_exc()
            finally:
                _gerando_proxy.discard(pasta)
        threading.Thread(target=gerar, daemon=True).start()
    return {"pronto": False}


_gerando_montagem = set()


def montagem(pasta, segs):
    """Prévia corrida do mini editor: só os trechos mantidos, já colados, a
    partir do proxy (540p). O player toca esse arquivo direto, sem pular
    dentro do vídeo — por isso não trava nos cortes. `segs` vem do app já
    arredondado em quadros (1/30 s), pra o tempo bater exato com o bruto.
    Gera em segundo plano (poucos segundos); o app pergunta de novo até ficar pronta."""
    import hashlib
    chave = hashlib.sha1(json.dumps(segs).encode()).hexdigest()[:12]
    destino = pasta / f"montagem-{chave}.mp4"
    if destino.exists():
        return {"pronto": True, "arquivo": destino.name}
    fonte = pasta / "proxy.mp4"
    if not fonte.exists():
        proxy(pasta)
        return {"pronto": False}
    if chave not in _gerando_montagem:
        _gerando_montagem.add(chave)

        def gerar():
            import subprocess
            tmp = pasta / f"montagem-{chave}.tmp.mp4"
            fc = []
            for i, (a, b) in enumerate(segs):
                f0, f1 = round(a * 30), round(b * 30)
                d = (f1 - f0) / 30
                fc.append(f"[0:v]trim=start_frame={f0}:end_frame={f1},setpts=PTS-STARTPTS[v{i}]")
                fc.append(f"[0:a]atrim=start_sample={f0 * 1600}:end_sample={f1 * 1600},asetpts=PTS-STARTPTS,"
                          f"afade=t=in:d=0.012,afade=t=out:st={max(0, d - 0.018):.3f}:d=0.018[a{i}]")
            fc.append("".join(f"[v{i}][a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=1[v][a]")
            script = pasta / f"_tmp_montagem-{chave}.txt"
            script.write_text(";\n".join(fc))
            try:
                subprocess.run([motor.FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(fonte),
                                "-filter_complex_script", str(script), "-map", "[v]", "-map", "[a]",
                                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-g", "15", "-bf", "0",
                                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(tmp)], check=True)
                tmp.replace(destino)
                for velho in pasta.glob("montagem-*.mp4"):      # guarda só as 3 últimas
                    if velho not in sorted(pasta.glob("montagem-*.mp4"), key=lambda x: x.stat().st_mtime)[-3:]:
                        velho.unlink(missing_ok=True)
            except Exception:
                traceback.print_exc()
            finally:
                script.unlink(missing_ok=True)
                _gerando_montagem.discard(chave)
        threading.Thread(target=gerar, daemon=True).start()
    return {"pronto": False}


def ondas(pasta, por_segundo=100, musica=False):
    """Forma de onda pro mini editor: do bruto (faixa A1) ou da música (A2).
    Pico de volume a cada 10 ms, de 0 a 1 (escala com raiz, pra fala baixa
    ainda aparecer). Guarda em onda.json / onda-musica-<nome>.json."""
    import subprocess
    projeto = json.loads((pasta / "projeto.json").read_text())
    if musica:
        if not projeto.get("musica"):
            return {"por_segundo": por_segundo, "picos": []}
        arq = Path(projeto["musica"]["arquivo"])
        cache, wav = pasta / f"onda-musica-{arq.stem}.json", pasta / "_tmp_musica.wav"
        if not cache.exists():
            subprocess.run([motor.FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(arq), "-vn", "-ac", "1",
                            "-ar", "16000", str(wav)], check=True)
    else:
        cache, wav = pasta / "onda.json", pasta / "audio.wav"
    if cache.exists():
        return json.loads(cache.read_text())
    if not wav.exists():
        subprocess.run([motor.FF, "-hide_banner", "-loglevel", "error", "-y", "-i", projeto["fonte"], "-vn", "-ac", "1",
                        "-ar", "16000", str(wav)], check=True)
    import array, wave
    with wave.open(str(wav)) as w:
        taxa, dados = w.getframerate(), array.array("h", w.readframes(w.getnframes()))
    janela = max(1, taxa // por_segundo)
    picos = [max((abs(x) for x in dados[i:i + janela]), default=0) for i in range(0, len(dados), janela)]
    topo = max(picos) or 1
    resultado = {"por_segundo": por_segundo, "picos": [round((p / topo) ** 0.5, 3) for p in picos]}
    cache.write_text(json.dumps(resultado))
    return resultado


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Chave, Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length")

    def _json(self, codigo, dados):
        corpo = json.dumps(dados, ensure_ascii=False).encode()
        self.send_response(codigo)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _rota(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        chave = self.headers.get("X-Chave") or q.get("k", [""])[0]
        if not secrets.compare_digest(chave, CFG["chave"]):
            return None, None, q
        partes = [urllib.parse.unquote(p) for p in url.path.strip("/").split("/")]
        return partes, url, q

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        partes, _, _ = self._rota()
        if partes is None:
            return self._json(403, {"erro": "chave inválida"})
        try:
            if len(partes) == 3 and partes[0] == "edicoes" and partes[2] == "proxy":
                return self._json(200, proxy(pasta_de(partes[1])))
            if len(partes) == 3 and partes[0] == "edicoes" and partes[2] == "ondas":
                return self._json(200, ondas(pasta_de(partes[1]), musica="musica=1" in urllib.parse.urlparse(self.path).query))
            if len(partes) == 3 and partes[0] == "edicoes" and partes[2] == "projeto":
                return self._json(200, json.loads((pasta_de(partes[1]) / "projeto.json").read_text()))
            if len(partes) >= 4 and partes[0] == "edicoes" and partes[2] == "arquivo":
                pasta = pasta_de(partes[1])
                # Sem ".." (não sai da pasta); atalhos (ex.: bruto.mov → cópia) valem.
                rel = Path(os.path.normpath("/".join(partes[3:])))
                arq = pasta / rel
                if rel.is_absolute() or rel.parts[:1] == ("..",) or not arq.is_file():
                    return self._json(404, {"erro": "arquivo não encontrado"})
                return self._arquivo(arq)
        except FileNotFoundError:
            return self._json(404, {"erro": "edição não encontrada"})
        self._json(404, {"erro": "rota desconhecida"})

    def _arquivo(self, arq):
        tam = arq.stat().st_size
        ini, fim = 0, tam - 1
        faixa = self.headers.get("Range")
        if faixa and faixa.startswith("bytes="):
            a, _, b = faixa[6:].partition("-")
            ini = int(a) if a else 0
            fim = min(int(b), tam - 1) if b else tam - 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {ini}-{fim}/{tam}")
        else:
            self.send_response(200)
        self._cors()
        self.send_header("Content-Type", TIPOS.get(arq.suffix.lower(), "application/octet-stream"))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fim - ini + 1))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with open(arq, "rb") as f:
            f.seek(ini)
            resta = fim - ini + 1
            while resta > 0:
                bloco = f.read(min(1 << 16, resta))
                if not bloco:
                    break
                try:
                    self.wfile.write(bloco)
                except (BrokenPipeError, ConnectionResetError):
                    return
                resta -= len(bloco)

    def do_POST(self):
        partes, _, q = self._rota()
        if partes is None:
            return self._json(403, {"erro": "chave inválida"})
        corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            if len(partes) != 3 or partes[0] != "edicoes":
                return self._json(404, {"erro": "rota desconhecida"})
            id_, acao = partes[1], partes[2]
            pasta = pasta_de(id_)
            if acao == "projeto":
                novo = json.loads(corpo)
                atual = json.loads((pasta / "projeto.json").read_text())
                for campo in ("fonte", "duracao_fonte", "palavras"):   # o app não troca o bruto
                    novo[campo] = atual.get(campo)
                hist = pasta / "versoes"
                hist.mkdir(exist_ok=True)
                shutil.copyfile(pasta / "projeto.json", hist / f"projeto-{datetime.now():%Y%m%d-%H%M%S}.json")
                (pasta / "projeto.json").write_text(json.dumps(novo, ensure_ascii=False, indent=1))
                if q.get("previa", ["1"])[0] != "0":    # previa=0: só salva (corte ao vivo no editor)
                    threading.Thread(target=gerar_previa, args=(id_,), daemon=True).start()
                return self._json(202, {"ok": True})
            if acao == "montagem":
                return self._json(200, montagem(pasta, json.loads(corpo)["segs"]))
            if acao == "midia":
                nome = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in q.get("nome", ["arquivo"])[0])[-80:]
                destino = pasta / "midias" / f"{datetime.now():%H%M%S}-{nome}"
                destino.parent.mkdir(exist_ok=True)
                destino.write_bytes(corpo)
                return self._json(200, {"arquivo": str(destino), "nome": destino.name})
            if acao == "aprovar":
                threading.Thread(target=aprovar, args=(id_,), daemon=True).start()
                return self._json(202, {"ok": True})
        except FileNotFoundError:
            return self._json(404, {"erro": "edição não encontrada"})
        except Exception as e:
            log("erro", traceback.format_exc()[-400:])
            return self._json(500, {"erro": str(e)[:200]})
        self._json(404, {"erro": "rota desconhecida"})

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    log("servidor iniciado na porta", CFG["porta"])
    ThreadingHTTPServer(("127.0.0.1", CFG["porta"]), Handler).serve_forever()
