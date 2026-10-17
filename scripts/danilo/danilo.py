"""Ferramentas do Danilo (editor IA) para editar um bruto do começo ao fim.
O serviço (servico.py) usa a parte mecânica; o Claude em segundo plano usa
os comandos abaixo na parte "de gosto" (retomadas, headline, pinturas).

  python3 danilo.py novos                       brutos novos em Eu.davi › Precisa de edição
  python3 danilo.py preparar "<arquivo>"        [EM EDIÇÃO], cópia local, edição, transcrição e card
  python3 danilo.py texto <id>                  fala do bruto com tempos (por trecho)
  python3 danilo.py ouvir <id> <ini> <fim>      retranscreve um trecho palavra a palavra (acha retomadas)
  python3 danilo.py quadros <id> <t1> <t2>...   foto do bruto nesses tempos (grade em _quadros.jpg)
  python3 danilo.py pintura buscar "<termos>"   procura pinturas no Wikimedia Commons
  python3 danilo.py pintura baixar <id> <nome> "<File:...>"   baixa (só domínio público/CC) e registra a fonte
  python3 danilo.py montar <id>                 escolhas.json → projeto.json (só na 1ª edição; refaz tudo)
  python3 danilo.py conferir <id> [--so-olhar]  prévia + transcrição dela + grade de quadros (_conferir.jpg)
  python3 danilo.py versao <id>                 manda o projeto.json ao servidor: nova versão oficial em Revisar edição

Ajuste numa edição que o Davi já viu: edite o projeto.json DIRETO (tempos no bruto;
ele já tem o que o Davi mudou no mini editor) e rode `versao`. NÃO rode `montar`:
ele reconstrói o projeto do escolhas.json e apaga os ajustes do Davi.
"""
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
sys.path.insert(0, str(AQUI))
from migration_db import connect  # noqa: E402


def _liberar_download_do_drive():
    """Processo do launchd (o serviço) nasce sem permissão de baixar arquivo
    "dataless" do Drive (File Provider): toda leitura dá Errno 11. Liga a
    política IOPOL_VFS_MATERIALIZE_DATALESS_FILES para este processo."""
    try:
        import ctypes
        libc = ctypes.CDLL("libc.dylib", use_errno=True)
        libc.setiopolicy_np(3, 0, 2)   # TYPE_VFS_MATERIALIZE_DATALESS_FILES, SCOPE_PROCESS, ON
    except Exception:
        pass


_liberar_download_do_drive()

CLIENTE = "e4b24f93-0eda-43fc-b50e-3ebe24f8905f"   # projeto Davi Queiroz
DRIVE = Path.home() / "Library/CloudStorage/GoogleDrive-metafocando@gmail.com/Meu Drive/Projeto 100k/Eu.davi"
ENTRADA = DRIVE / "Precisa de edição"
DESTINO = DRIVE / "Editado"
# Entrada direta no Mac (AirDrop → arrastar pra cá), sem passar pelo Drive.
# Depois de aprovado, o bruto vai pra LOCAL/Editados.
LOCAL = Path.home() / "Desktop" / "Para o Danilo"
LOCAL_EDITADOS = LOCAL / "Editados"
BASE = Path.home() / ".infopro-hub" / "danilo"
EDICOES = BASE / "edicoes"
BRUTOS = BASE / "brutos"
ACERVO = BASE / "acervo"            # música aprovada (Gymnopédie nº 1, CC0) etc.
FF = os.path.expanduser("~/.infopro-hub/creator-bin/ffmpeg")
CREATOR = os.path.expanduser("~/.infopro-hub/creator")
VIDEO = {".mov", ".mp4", ".m4v"}
EM_EDICAO, EDITADO = "[EM EDIÇÃO] ", "[EDITADO] "


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


def pasta(id_):
    return EDICOES / id_


# ---------------------------------------------------------------- brutos novos
_quebrados = {}   # bruto quebrado → motivo (pro aviso na tarefa do lote)


def faltando(f):
    """Bytes que faltam no fim do vídeo. O MOV/MP4 é uma fila de caixas (ftyp,
    mdat, moov…) e cada uma diz o próprio tamanho no cabeçalho: se a última
    passa do fim do arquivo, o envio parou no meio (ex.: o celular cortou o
    upload). Só lê os cabeçalhos (alguns bytes), não o vídeo."""
    total = os.path.getsize(f)
    pos = 0
    with open(f, "rb") as arq:
        while pos + 8 <= total:
            arq.seek(pos)
            cab = arq.read(16)
            tam = int.from_bytes(cab[:4], "big")
            if tam == 1 and len(cab) == 16:
                tam = int.from_bytes(cab[8:16], "big")      # caixa grande (64 bits)
            elif tam == 0:
                return 0                                    # "vai até o fim do arquivo"
            if tam < 8:
                return 0                                    # não é MOV/MP4 que eu entenda: deixa o ffmpeg julgar
            pos += tam
    return max(pos - total, 0)


def abre(f):
    """O vídeo abre? Devolve o motivo se não abre (None se está ok). Arquivo
    truncado fica sem o fim (às vezes sem o 'moov') e o ffmpeg não lê ou cai
    no meio da edição. Só olha arquivo já no Mac (não dispara download)."""
    if not no_mac(f):
        return None
    falta = faltando(f)
    if falta:
        return (f"o envio do celular parou no meio: faltaram {falta / 1e6:.0f} MB "
                f"(chegou {os.path.getsize(f) / 1e6:.0f} de {(os.path.getsize(f) + falta) / 1e6:.0f} MB)")
    r = subprocess.run([FF, "-hide_banner", "-i", str(f)], capture_output=True, text=True).stderr
    if "Duration:" in r and "moov atom not found" not in r:
        return None
    return "o vídeo não abre (arquivo corrompido)"


_tamanhos = {}   # arquivo local → (tamanho, quando viu): espera a cópia/AirDrop terminar


def _local_parado(f, segundos=30):
    """Arquivo local pronto: o tamanho não muda há `segundos`."""
    tam, agora = f.stat().st_size, datetime.now().timestamp()
    visto = _tamanhos.get(str(f))
    if not visto or visto[0] != tam:
        _tamanhos[str(f)] = (tam, agora)
        return False
    return tam > 0 and agora - visto[1] >= segundos


def novos(minutos_parado=3):
    """Vídeos sem [EM EDIÇÃO]/[EDITADO] que ninguém registrou ainda, nas duas
    entradas: a pasta Precisa de edição do Drive (parados há alguns minutos) e
    a pasta local Para o Danilo (tamanho parado: a cópia terminou)."""
    registrados = {Path(r[0]).name.replace(EM_EDICAO, "").replace(EDITADO, "")
                   for r in db("SELECT bruto_drive FROM public.edicoes_video WHERE cliente_id = %s "
                               "AND bruto_drive IS NOT NULL AND status <> 'cancelado'", (CLIENTE,))}
    agora = datetime.now().timestamp()
    pastas = [p for p in (LOCAL, ENTRADA) if p.is_dir()]
    if not pastas:
        raise OSError(f"nenhuma pasta de entrada encontrada ({LOCAL} / {ENTRADA})")
    out = []
    for pasta_ in pastas:
        for f in pasta_.iterdir():
            # "[EM EDIÇÃO]" sem edição registrada = o serviço caiu no meio: pega de novo.
            orfao = f.name.startswith(EM_EDICAO) and f.name[len(EM_EDICAO):] not in registrados
            if not f.is_file() or f.suffix.lower() not in VIDEO or f.name.startswith(".") or (f.name.startswith("[") and not orfao):
                continue
            if f.name.replace(EM_EDICAO, "") in registrados:
                continue
            if pasta_ == LOCAL:
                if not _local_parado(f):
                    continue
            elif agora - f.stat().st_mtime < minutos_parado * 60:
                continue
            motivo = abre(f)
            if motivo:
                if str(f) not in _quebrados:
                    print(f"bruto quebrado ({motivo}): {f}", flush=True)
                _quebrados[str(f)] = motivo
                continue
            _quebrados.pop(str(f), None)      # reenviado com o mesmo nome e agora inteiro
            out.append(f)
    return sorted(out, key=lambda f: (f.parent != LOCAL, f.name.replace(EM_EDICAO, "")))


def guardar_editados(log=print):
    """Bruto local de edição aprovada ([EDITADO] …) vai pra Para o Danilo/Editados."""
    if not LOCAL.is_dir():
        return
    for f in LOCAL.iterdir():          # (glob não serve: "[" vira padrão)
        if f.is_file() and f.name.startswith(EDITADO):
            LOCAL_EDITADOS.mkdir(exist_ok=True)
            destino = LOCAL_EDITADOS / f.name
            if not destino.exists():
                f.rename(destino)
                db("UPDATE public.edicoes_video SET bruto_drive = %s WHERE bruto_drive = %s",
                   (str(destino), str(f.with_name(EM_EDICAO + f.name[len(EDITADO):]))))
                log("bruto aprovado guardado em Editados:", f.name)


def _palavras(t):
    t = unicodedata.normalize("NFKD", (t or "").lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", t).split()


def identificar_card(fala):
    """Compara a fala com o roteiro dos cards em Gravação (e Edição sem edição
    ligada). Devolve (id, titulo, nota) se tiver certeza; senão (None, palpites)."""
    cards = db("""SELECT v.id, v.titulo, coalesce(v.roteiro, '') FROM public.videos_vertical v
                  WHERE v.cliente_id = %s AND v.status IN ('gravacao', 'edicao')
                    AND NOT EXISTS (SELECT 1 FROM public.edicoes_video e WHERE e.video_vertical_id = v.id
                                    AND e.status <> 'cancelado')""", (CLIENTE,))
    falados = _palavras(fala)[:200]
    tri_fala = {tuple(falados[i:i + 3]) for i in range(len(falados) - 2)}
    notas = []
    for id_, titulo, roteiro in cards:
        r = _palavras(roteiro or titulo)[:200]
        tri = {tuple(r[i:i + 3]) for i in range(len(r) - 2)}
        notas.append((len(tri & tri_fala) / max(1, len(tri)), str(id_), titulo))
    notas.sort(reverse=True)
    if notas and notas[0][0] >= 0.2 and (len(notas) == 1 or notas[0][0] >= 2 * notas[1][0]):
        return notas[0][1], notas[0][2], round(notas[0][0], 2)
    return None, [(t, round(n, 2)) for n, _, t in notas[:3]]


def no_mac(arquivo):
    """O arquivo do Drive já está baixado (não é "dataless")?"""
    return not (os.stat(arquivo).st_flags & 0x40000000)   # SF_DATALESS


def copiar_do_drive(origem, destino, minutos=60, log=print):
    """Copia um arquivo do Google Drive do Mac (modo streaming). Recém-chegado,
    o arquivo fica "dataless": o fcopyfile falha (Errno 11) e a leitura dá
    timeout (Errno 60) até o Drive baixar tudo — o que a própria leitura dispara
    (um bruto de 1 GB levou ~5 min). Então: lê em blocos e, se o Drive ainda
    não entregou, espera e tenta de novo do ponto onde parou."""
    import errno
    import time
    limite = time.time() + minutos * 60
    feito, avisou = 0, False
    with open(destino, "ab" if destino == os.devnull else "wb") as out:
        while True:
            try:
                with open(origem, "rb") as f:
                    f.seek(feito)
                    while True:
                        bloco = f.read(8 << 20)
                        if not bloco:
                            return destino
                        out.write(bloco)
                        feito += len(bloco)
            except OSError as e:
                if e.errno not in (errno.EDEADLK, errno.ETIMEDOUT, errno.EAGAIN, errno.EIO) or time.time() > limite:
                    raise
                if not avisou:
                    log("Drive ainda baixando", Path(origem).name, f"({e.strerror}); esperando…")
                    avisou = True
                time.sleep(15)


class pesado:
    """Um trabalho pesado por vez no Mac de 8 GB: whisper (~2 GB) e montagem
    do ffmpeg (~3 GB) juntos estouram a memória. Trava num arquivo comum aos
    processos do Danilo e, antes, espera a montagem do servidor (prévia/Full HD)
    terminar."""
    def __enter__(self):
        import fcntl
        import time
        BASE.mkdir(parents=True, exist_ok=True)
        self.f = open(BASE / "pesado.lock", "w")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        while subprocess.run(["pgrep", "-f", r"ffmpeg.*(previa|final)\.tmp\.mp4"], capture_output=True).returncode == 0:
            time.sleep(10)
        return self

    def __exit__(self, *_):
        import fcntl
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def transcrever(p):
    """Em outro processo: o modelo do whisper (~2 GB) sai da memória quando
    termina (dentro do serviço ele ficava preso, que roda o dia todo)."""
    with pesado():
        r = subprocess.run([sys.executable, str(AQUI / "criar_projeto.py"), str(p), "transcrever"],
                           stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"falhou ao transcrever: {motivo_do_erro(r.stderr, r.returncode)}")
    return json.loads((Path(p) / "transcricao.json").read_text())


def motivo_do_erro(saida, codigo=None):
    """Da saída de erro de um processo, o que diz o motivo: as linhas que vieram
    antes do traceback (ex.: o erro do ffmpeg) e a última linha dele (a exceção)."""
    linhas = [l.strip() for l in (saida or "").splitlines() if l.strip()]
    if codigo is not None and codigo < 0:
        # Morto por sinal: no Mac de 8 GB quase sempre é o sistema tirando por falta de memória.
        linhas.append(f"o processo foi encerrado pelo sistema (sinal {-codigo}; provável falta de memória)")
    if not linhas:
        return "o processo parou sem dizer o motivo" + (f" (código {codigo})" if codigo is not None else "")
    if "Traceback (most recent call last):" in linhas:
        i = linhas.index("Traceback (most recent call last):")
        partes = linhas[max(0, i - 2):i] + [linhas[-1]]
    else:
        partes = linhas[-3:]
    return " | ".join(partes)[-400:]


def preparar(arquivo, log=print):
    """Bruto do Drive → edição criada, transcrita e ligada ao card. Devolve o id."""
    arquivo = Path(arquivo)
    nome = arquivo.name.replace(EM_EDICAO, "")
    marcado = arquivo.with_name(EM_EDICAO + nome)
    uid = db("SELECT user_id FROM public.clientes WHERE id = %s", (CLIENTE,))[0][0]
    # Registra antes de renomear: se o serviço cair no meio, o bruto não fica órfão.
    id_ = str(db("""INSERT INTO public.edicoes_video (cliente_id, user_id, titulo, status, mensagem, bruto_drive)
                    VALUES (%s, %s, %s, 'editando', 'Danilo baixando o bruto do Drive…', %s) RETURNING id""",
                 (CLIENTE, uid, f"Bruto {Path(nome).stem}", str(marcado)))[0][0])
    if arquivo != marcado:
        arquivo.rename(marcado)                   # outra verificação não pega o mesmo bruto
    try:
        BRUTOS.mkdir(parents=True, exist_ok=True)
        # A pasta Precisa de edição fica "disponível off-line": o bruto já está no
        # Mac e a edição lê direto dele (sem cópia de 1 GB num disco apertado).
        if not no_mac(marcado):
            copiar_do_drive(marcado, os.devnull, log=log)   # ler inteiro faz o Drive baixar
        local = marcado
        p = pasta(id_)
        (p / "imagens").mkdir(parents=True)
        os.symlink(local, p / f"bruto{local.suffix.lower()}")
        _msg(id_, "Danilo ouvindo e transcrevendo a fala…")
        tr = transcrever(p)
        fala = " ".join(s["text"] for s in tr["segments"])
        card = identificar_card(fala)
        contexto = {"bruto": nome, "bruto_drive": str(marcado), "card": None}
        if card[0]:
            vid, titulo, nota = card
            roteiro = db("SELECT roteiro FROM public.videos_vertical WHERE id = %s", (vid,))[0][0]
            db("UPDATE public.videos_vertical SET status = 'edicao' WHERE id = %s AND status = 'gravacao'", (vid,))
            db("UPDATE public.edicoes_video SET video_vertical_id = %s, titulo = %s WHERE id = %s", (vid, titulo, id_))
            contexto["card"] = {"id": vid, "titulo": titulo, "roteiro": roteiro, "nota": nota}
            ligar_tarefas()   # a automação do card cria "Editar: <vídeo>" pro Danilo
            log("card:", titulo, nota)
        else:
            contexto["palpites"] = card[1]
            log("card não identificado:", card[1])
        (p / "contexto.json").write_text(json.dumps(contexto, ensure_ascii=False, indent=1))
        base = "-".join(_palavras((contexto.get("card") or {}).get("titulo") or "")[:8]) or Path(nome).stem
        (p / "entrega.json").write_text(json.dumps({"destino_dir": str(DESTINO), "bruto_drive": str(marcado),
                                                    "nome_final": f"{base}-{Path(nome).stem}-editado-danilo"}, ensure_ascii=False))
        musica = ACERVO / "gymnopedie-1.ogg"
        if musica.exists():
            shutil.copyfile(musica, p / "imagens" / "musica.ogg")
        return id_
    except Exception as erro:
        db("UPDATE public.edicoes_video SET status = 'erro', mensagem = %s WHERE id = %s",
           (f"Danilo não conseguiu preparar o bruto: {str(erro)[:400]}", id_))
        raise


def ligar_tarefas():
    """Tarefas "Editar: <vídeo>" (tipo edicao, criadas quando o card vai pra
    Edição) ficam ligadas à edição do vídeo: andamento na barra e, ao aprovar,
    o servidor conclui a tarefa. Sem edição ainda: esperando o bruto."""
    for aid, vid in db("""SELECT a.id, a.video_vertical_id FROM public.atividades a
                          WHERE a.cliente_id = %s AND a.tipo = 'edicao' AND a.video_vertical_id IS NOT NULL
                            AND a.deleted_at IS NULL AND NOT a.concluida""", (CLIENTE,)):
        ed = db("""SELECT id, status FROM public.edicoes_video WHERE video_vertical_id = %s AND status <> 'cancelado'
                   ORDER BY criado_em DESC LIMIT 1""", (vid,))
        if not ed:
            db("""UPDATE public.atividades SET observacao = 'Esperando o bruto em Eu.davi › Precisa de edição '
                    || '(o Danilo pega sozinho quando cair lá).'
                  WHERE id = %s AND observacao IS NULL""", (aid,))
            continue
        eid, st = ed[0]
        db("UPDATE public.edicoes_video SET atividade_id = %s WHERE id = %s AND atividade_id IS NULL", (aid, eid))
        if st in ("revisar", "erro"):
            sit, prog, obs = "aguardando_aprovacao", 100, ("Pronto para sua revisão em Precisa de você › Revisar edição."
                                                           if st == "revisar" else "Deu erro na edição: veja em Precisa de você.")
        else:
            sit, prog, obs = "andamento", 40, "Agora: Danilo editando o vídeo."
        db("""UPDATE public.atividades SET situacao = %s, progresso = %s, observacao = %s
              WHERE id = %s AND (situacao IS DISTINCT FROM %s OR progresso IS DISTINCT FROM %s)""",
           (sit, prog, obs, aid, sit, prog))


def _msg(id_, texto):
    db("UPDATE public.edicoes_video SET mensagem = %s, atualizado_em = now() WHERE id = %s", (texto, id_))


# ---------------------------------------------------------------- ouvir e ver
def texto(id_):
    tr = json.loads((pasta(id_) / "transcricao.json").read_text())
    for s in tr["segments"]:
        print(f"{s['start']:7.2f}-{s['end']:7.2f} {s['text'].strip()}")


def _whisper(wav, offset=0.0, palavras=True):
    with pesado():
        return _whisper_livre(wav, offset, palavras)


def _whisper_livre(wav, offset=0.0, palavras=True):
    sys.path.insert(0, CREATOR)
    os.environ["PATH"] = os.path.dirname(FF) + os.pathsep + os.environ["PATH"]
    import mlx_whisper
    r = mlx_whisper.transcribe(str(wav), path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="pt",
                               word_timestamps=palavras, condition_on_previous_text=False, verbose=None)
    for s in r["segments"]:
        s["start"] += offset
        s["end"] += offset
        for w in s.get("words", []):
            w["start"] += offset
            w["end"] += offset
    return r


def ouvir(id_, ini, fim):
    """Retranscreve só o trecho (o whisper do bruto inteiro às vezes pula tomadas
    repetidas ou inventa '3º/4º' nas emendas)."""
    p = pasta(id_)
    wav = p / "_trecho.wav"
    subprocess.run([FF, "-v", "error", "-y", "-ss", str(ini), "-to", str(fim), "-i", str(p / "audio.wav"), str(wav)], check=True)
    r = _whisper(wav, float(ini))
    print(" ".join(f"{w['word'].strip()}@{w['start']:.2f}-{w['end']:.2f}" for s in r["segments"] for w in s["words"]))


def _grade(fotos, destino, largura=240):
    from PIL import Image
    ims = [Image.open(f) for f in fotos]
    o = Image.new("RGB", (largura * len(ims), max(i.height for i in ims)))
    for i, im in enumerate(ims):
        o.paste(im, (largura * i, 0))
    o.save(destino)
    for f in fotos:
        os.remove(f)


def quadros(id_, tempos, video=None, destino="_quadros.jpg"):
    p = pasta(id_)
    video = video or next(p.glob("bruto.*"))
    fotos = []
    for i, t in enumerate(tempos):
        f = p / f"_q{i}.jpg"
        subprocess.run([FF, "-v", "error", "-y", "-ss", str(t), "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=240:-1", str(f)], check=True)
        fotos.append(f)
    _grade(fotos, p / destino)
    print(p / destino)


# ---------------------------------------------------------------- pinturas
UA = {"User-Agent": "InfoproHub-Danilo/1.0 (editor de video interno)"}
LIVRES = re.compile(r"^(public domain|pd|cc0|cc[ -]by)", re.I)


def _api(params):
    sys.path.insert(0, CREATOR)
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), context=ctx, timeout=60)), ctx


def pintura_buscar(termos):
    r, _ = _api({"action": "query", "list": "search", "srsearch": termos, "srnamespace": 6, "srlimit": 8})
    for x in r["query"]["search"]:
        print(x["title"])


def pintura_baixar(id_, nome, titulo):
    r, ctx = _api({"action": "query", "titles": titulo, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 2000})
    info = next(iter(r["query"]["pages"].values()))["imageinfo"][0]
    meta = info["extmetadata"]
    licenca = meta.get("LicenseShortName", {}).get("value", "")
    if not LIVRES.match(licenca):
        raise SystemExit(f"licença '{licenca}' não é livre: escolha outra")
    destino = pasta(id_) / "imagens" / f"{nome}.jpg"
    with urllib.request.urlopen(urllib.request.Request(info.get("thumburl") or info["url"], headers=UA), context=ctx, timeout=120) as resp:
        destino.write_bytes(resp.read())
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(destino)
    im.thumbnail((2000, 2000))
    im.convert("RGB").save(destino, quality=92)
    fontes_arq = destino.parent / "fontes.json"
    fontes = json.loads(fontes_arq.read_text()) if fontes_arq.exists() else {}
    fontes[nome] = {"arquivo": titulo, "pagina": info["descriptionurl"], "licenca": licenca,
                    "artista": re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))[:120]}
    fontes_arq.write_text(json.dumps(fontes, ensure_ascii=False, indent=1))
    print(destino, "·", licenca)


# ---------------------------------------------------------------- montar e conferir
def montar(id_, refazer=False):
    import criar_projeto
    p = pasta(id_)
    st = db("SELECT status FROM public.edicoes_video WHERE id = %s", (id_,))
    if (p / "projeto.json").exists() and st and st[0][0] != "editando" and not refazer:
        raise SystemExit("Esta edição já foi para o Davi: o montar apagaria os ajustes dele no projeto.json. "
                         "Edite o projeto.json direto e rode `danilo.py versao <id>` (ou use --refazer de propósito).")
    esc = json.loads((p / "escolhas.json").read_text())
    proj = criar_projeto.montar(p, esc)
    print(f"{len(proj['remocoes'])} remoções · {len(proj['legendas'])} legendas · {len(proj['midias'])} mídias")


def nova_versao(id_, minutos=30, projeto=None):
    """Manda o projeto.json ao servidor do Danilo (porta 3103, uma montagem por
    vez): ele guarda a versão anterior, gera a prévia oficial e põe a edição em
    'revisar' (o editor do Davi recarrega sozinho). Devolve (status, mensagem)."""
    import time
    cfg = json.loads((BASE / "config.json").read_text())
    antes = db("SELECT versao FROM public.edicoes_video WHERE id = %s", (id_,))[0][0]
    req = urllib.request.Request(f"http://127.0.0.1:{cfg['porta']}/edicoes/{id_}/projeto",
                                 data=json.dumps(projeto, ensure_ascii=False).encode() if projeto is not None
                                 else (pasta(id_) / "projeto.json").read_bytes(), method="POST",
                                 headers={"X-Chave": cfg["chave"], "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()
    for _ in range(minutos * 6):
        time.sleep(10)
        st, msg, v = db("SELECT status, mensagem, versao FROM public.edicoes_video WHERE id = %s", (id_,))[0]
        if st == "erro" or (st == "revisar" and v > antes):
            return st, msg
    raise RuntimeError(f"a prévia passou de {minutos} min")


# ---------------------------------------------------------------- nuvem (editor pela web)
def chaves_publicas():
    """URL e chave pública do Supabase (no Mac não há chave de servidor: o
    bucket `edicoes` aceita o envio pelo token da edição)."""
    env = dict(l.split("=", 1) for l in (RAIZ / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    url = env.get("VITE_SUPABASE_URL", "").strip().strip('"')
    chave = env.get("VITE_SUPABASE_PUBLISHABLE_KEY", "").strip().strip('"')
    if not url or not chave:
        raise RuntimeError("falta VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY no .env")
    return url, chave


def _subir(caminho, dados, tipo):
    import ssl
    sys.path.insert(0, CREATOR)
    import certifi
    url, chave = chaves_publicas()
    req = urllib.request.Request(f"{url}/storage/v1/object/edicoes/{caminho}", data=dados, method="POST",
                                 headers={"apikey": chave, "Authorization": f"Bearer {chave}",
                                          "Content-Type": tipo, "x-upsert": "false"})
    try:
        urllib.request.urlopen(req, context=ssl.create_default_context(cafile=certifi.where()), timeout=600).read()
    except urllib.error.HTTPError as e:
        corpo = e.read().decode()[:200]
        if e.code not in (400, 409) or "exists" not in corpo:     # já subiu antes: serve
            raise RuntimeError(f"Storage recusou {caminho} (HTTP {e.code}): {corpo}")
    return f"{url}/storage/v1/object/public/edicoes/{caminho}"


def sincronizar_nuvem(id_):
    """Projeto, prévia e forma de onda da versão atual na nuvem, pro editor web.
    A prévia (540p, ~20 MB) e a onda são do jeito que o mini editor do Mac usa."""
    p = pasta(id_)
    if not (p / "projeto.json").exists():
        return False
    cliente, token, versao, previa_url, ondas_url = db(
        "SELECT cliente_id, token_envio, versao, previa_url, ondas_url FROM public.edicoes_video WHERE id = %s", (id_,))[0]
    base = f"{cliente}/{id_}/{token}"
    projeto = json.loads((p / "projeto.json").read_text())
    if (p / "previa.mp4").exists() and not (previa_url or "").endswith(f"/previa-v{versao}.mp4"):
        previa_url = _subir(f"{base}/previa-v{versao}.mp4", (p / "previa.mp4").read_bytes(), "video/mp4")
    if not ondas_url:   # onda do bruto (tempo do bruto, igual à linha do tempo): não muda entre versões
        from servidor import ondas
        ondas_url = _subir(f"{base}/ondas-v1.json", json.dumps(ondas(p)).encode(), "application/json")
    db("""UPDATE public.edicoes_video SET projeto = %s, projeto_em = now(), previa_url = %s, ondas_url = %s
          WHERE id = %s""", (json.dumps(projeto, ensure_ascii=False), previa_url, ondas_url, id_))
    return True


def aprovar_pelo_servidor(id_, minutos=60):
    """Mesmo caminho do botão Aprovar do app no Mac (Full HD, Drive, Dalila)."""
    import time
    cfg = json.loads((BASE / "config.json").read_text())
    req = urllib.request.Request(f"http://127.0.0.1:{cfg['porta']}/edicoes/{id_}/aprovar", data=b"{}", method="POST",
                                 headers={"X-Chave": cfg["chave"], "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()
    for _ in range(minutos * 6):
        time.sleep(10)
        st, msg = db("SELECT status, mensagem FROM public.edicoes_video WHERE id = %s", (id_,))[0]
        if st in ("aprovado", "erro"):
            return st, msg
    raise RuntimeError(f"o Full HD passou de {minutos} min")


def conferir(id_, so_olhar=False):
    """Monta a prévia, transcreve o vídeo montado (a fala tem que correr inteira,
    sem tomada repetida nem sílaba cortada) e tira quadros pra olhar.
    so_olhar: confere a previa.mp4 que já existe (ex.: logo depois do `versao`)."""
    import motor
    p = pasta(id_)
    if so_olhar:
        previa = p / "previa.mp4"
        import criar_projeto
        dur = criar_projeto.duracao(previa)
    else:
        if not (p / "proxy.mp4").exists():      # sem o proxy, a prévia sairia do 4K (lento e pesado)
            from servidor import fazer_proxy
            with pesado():
                fazer_proxy(p)
        with pesado():
            previa, dur = motor.renderizar(p, previa=True)
    wav = p / "_previa.wav"
    subprocess.run([FF, "-v", "error", "-y", "-i", str(previa), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
    r = _whisper(wav, palavras=False)
    print(f"prévia: {dur:.1f}s")
    for s in r["segments"]:
        print(f"{s['start']:6.1f} {s['text'].strip()}")
    tempos = [round(dur * k / 9, 1) for k in range(1, 9)] + [round(dur - 0.5, 1)]
    quadros(id_, tempos, video=previa, destino="_conferir.jpg")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    cmd = a[0]
    if cmd == "novos":
        for f in novos():
            print(f)
    elif cmd == "preparar":
        print(preparar(a[1]))
    elif cmd == "texto":
        texto(a[1])
    elif cmd == "ouvir":
        ouvir(a[1], float(a[2]), float(a[3]))
    elif cmd == "quadros":
        quadros(a[1], [float(x) for x in a[2:]])
    elif cmd == "pintura" and a[1] == "buscar":
        pintura_buscar(a[2])
    elif cmd == "pintura" and a[1] == "baixar":
        pintura_baixar(a[2], a[3], a[4])
    elif cmd == "montar":
        montar(a[1], refazer="--refazer" in a)
    elif cmd == "conferir":
        conferir(a[1], so_olhar="--so-olhar" in a)
    elif cmd == "versao":
        print(*nova_versao(a[1]))
    else:
        raise SystemExit(__doc__)
