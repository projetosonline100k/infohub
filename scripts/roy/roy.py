"""Roy — carrosséis do @eu.davioficial a partir dos reels já publicados
(docs/agentes/roy-carrossel.md). Quem escreve o conteúdo é o Claude (chat do
Roy); este script faz a parte mecânica e não publica nada no Instagram.

  python3 roy.py candidatos [n]        reels elegíveis (mais novo primeiro), sem os já usados
  python3 roy.py iniciar <media_id> [--tarefa <atividade>]  marca EM PRODUÇÃO (ligado à tarefa), baixa e transcreve
  python3 roy.py renderizar <id|pasta> [--estilo x] [--sem-drive]
                                       páginas + revisão automática + Drive + envia pra revisão no Infopro
  python3 roy.py revisar <id|pasta>    só a revisão automática
  python3 roy.py ajustes               carrosséis em que o Davi pediu ajuste (com o pedido)
  python3 roy.py estilos               grava os estilos de scripts/roy/estilos/ no Infopro

Pasta de trabalho: ~/.infopro-hub/roy/carrosseis/<id>/ (video, transcricao,
conteudo.json, NN.png). O Claude escreve conteudo.json lá (ver render.py).
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.request
from datetime import date, datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
sys.path.insert(0, str(AQUI))
from migration_db import connect  # noqa: E402
import instagram  # noqa: E402
import render  # noqa: E402

CLIENTE = "e4b24f93-0eda-43fc-b50e-3ebe24f8905f"  # projeto Davi Queiroz (empresa do Roy)
TRABALHO = render.BASE / "carrosseis"
# Atenção: a pasta "Carrossel " tem um espaço no fim.
DRIVE = Path.home() / "Library/CloudStorage/GoogleDrive-metafocando@gmail.com/Meu Drive/Projeto 100k/Eu.davi/Carrossel "
FF = Path.home() / ".infopro-hub/creator-bin/ffmpeg"
OCR = render.BASE / "bin" / "ocr"
# Fontes já convertidas antes do Roy rodar no Infopro (manual, item 8).
USADAS_MANUAL = {
    "18626748931061370", "17878111602554741", "18111039743594838", "18190654285392067",
    "18111675473602878", "18127639126693123", "17891845614436257", "18092964299643672", "18122468641852559",
    # reposts do reel dos alarmes (mesmo vídeo do 008, com outra legenda)
    "17985726438058804", "17904044271550433",
    # repost do "Passatempos que reprogramam a sua mente" (17954066688016310)
    "18108589217037602",
}


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


def _norm(t):
    t = unicodedata.normalize("NFKD", (t or "").lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", t).split()


def _primeira_linha(legenda):
    return " ".join(_norm((legenda or "").split("\n")[0]))[:60]


# ------------------------------------------------------------------ escolha
def fontes_usadas():
    usadas = set(USADAS_MANUAL)
    for linha in db("SELECT fonte_id FROM public.carrosseis WHERE cliente_id = %s", (CLIENTE,)) or []:
        usadas.add(linha[0])
    if DRIVE.is_dir():
        for ref in DRIVE.glob("*/referencia.txt"):
            try:
                texto = ref.read_text(errors="replace")
            except OSError:  # Drive pode negar leitura ao processo em segundo plano
                continue
            m = re.search(r"ID da fonte:\s*(\d+)", texto)
            if m:
                usadas.add(m.group(1))
    return usadas


def candidatos(n=10):
    """Reels pela data real, sem os já usados. Reels repostados (mesma
    primeira linha de legenda de um já usado) também saem."""
    reels = instagram.reels()
    usadas = fontes_usadas()
    legendas_usadas = {_primeira_linha(r.get("caption")) for r in reels if r["id"] in usadas}
    vistos, saida = set(), []
    for r in reels:
        chave = _primeira_linha(r.get("caption"))
        if r["id"] in usadas or chave in legendas_usadas or chave in vistos:
            continue
        vistos.add(chave)
        saida.append(r)
    return saida[:n]


# ------------------------------------------------------------------ início
def proximo_numero():
    nums = [int(p.name[:3]) for p in DRIVE.glob("[0-9][0-9][0-9] - *")] if DRIVE.is_dir() else []
    linha = db("SELECT max(numero) FROM public.carrosseis WHERE cliente_id = %s", (CLIENTE,))
    if linha and linha[0][0]:
        nums.append(linha[0][0])
    return max(nums or [0]) + 1


def iniciar(media_id, tarefa=None):
    """`tarefa`: atividade do Roy que pediu este carrossel. O carrossel já nasce
    ligado a ela (atividade_roy_id), então um lote que cai no meio é retomado
    sem duplicar (scripts/roy/servico.py)."""
    reel = next((r for r in instagram.reels() if r["id"] == media_id), None)
    if not reel:
        raise SystemExit(f"Reel {media_id} não encontrado no perfil.")
    parado = db("SELECT id FROM public.carrosseis WHERE cliente_id = %s AND fonte_id = %s AND status = 'erro'",
                (CLIENTE, media_id))
    if parado:  # retoma uma produção que falhou, em vez de duplicar
        id_ = parado[0][0]
        db("UPDATE public.carrosseis SET status = 'produzindo', mensagem = 'Transcrevendo o reel…', atualizado_em = now() "
           "WHERE id = %s", (id_,))
    elif media_id in fontes_usadas():
        raise SystemExit(f"A fonte {media_id} já virou carrossel (ou está em produção).")
    else:
        id_ = _registrar(reel)
    if tarefa:
        db("UPDATE public.carrosseis SET atividade_roy_id = %s WHERE id = %s", (tarefa, id_))
    pasta = TRABALHO / str(id_)
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "fonte.json").write_text(json.dumps({k: v for k, v in reel.items() if k not in ("media_url", "thumbnail_url")},
                                                 ensure_ascii=False, indent=1))
    try:
        video = baixar_video(reel, pasta)
        transcrever(pasta, video)
        db("UPDATE public.carrosseis SET mensagem = 'Escrevendo o conteúdo…', atualizado_em = now() WHERE id = %s", (id_,))
    except Exception as e:
        db("UPDATE public.carrosseis SET status = 'erro', mensagem = %s, atualizado_em = now() WHERE id = %s",
           (f"Falhou ao baixar/transcrever: {str(e)[:200]}", id_))
        raise
    print(id_)
    print(pasta)
    return id_, pasta


def _registrar(reel):
    numero = proximo_numero()
    # EM PRODUÇÃO antes de tudo: o UNIQUE (cliente_id, fonte_id) impede duplicar.
    return db("""INSERT INTO public.carrosseis (cliente_id, numero, tema, fonte_id, fonte_permalink, fonte_data,
                  fonte_legenda, status, mensagem)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'produzindo', 'Transcrevendo o reel…') RETURNING id""",
             (CLIENTE, numero, (reel.get("caption") or "Sem título").split("\n")[0][:80], reel["id"],
              reel.get("permalink"), reel["timestamp"], reel.get("caption")))[0][0]


def baixar_video(reel, pasta):
    """Pelo media_url da API; quando a Meta não manda (ex.: música com
    direitos), baixa só o áudio pelo permalink com o yt-dlp do Creator."""
    if reel.get("media_url"):
        return instagram.baixar(reel["media_url"], pasta / "video.mp4")
    sys.path.insert(0, str(Path.home() / ".infopro-hub/creator"))
    import yt_dlp
    opcoes = {"format": "bestaudio/best", "outtmpl": str(pasta / "video.%(ext)s"), "quiet": True,
              "no_warnings": True, "ffmpeg_location": str(FF.parent)}
    with yt_dlp.YoutubeDL(opcoes) as ydl:
        ydl.download([reel["permalink"]])
    return next(p for p in pasta.glob("video.*") if not p.name.endswith(".part"))


def transcrever(pasta, video):
    audio = pasta / "audio.wav"
    subprocess.run([str(FF), "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
                    str(audio)], check=True)
    sys.path.insert(0, str(Path.home() / ".infopro-hub/creator"))
    import os
    os.environ["PATH"] = str(FF.parent) + os.pathsep + os.environ["PATH"]
    import mlx_whisper
    r = mlx_whisper.transcribe(str(audio), path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="pt", verbose=None)
    (pasta / "transcricao.txt").write_text(r["text"].strip() + "\n")
    audio.unlink(missing_ok=True)
    return r["text"]


# ------------------------------------------------------------------ revisão
def _hash(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def _cobertura(ilustracao, caixa_ilu, caixa):
    """Fração de uma caixa de texto coberta pela parte opaca da escultura."""
    from PIL import Image
    x0, y0 = max(caixa[0], caixa_ilu[0]), max(caixa[1], caixa_ilu[1])
    x1, y1 = min(caixa[2], caixa_ilu[2]), min(caixa[3], caixa_ilu[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    w, h = caixa_ilu[2] - caixa_ilu[0], caixa_ilu[3] - caixa_ilu[1]
    alfa = Image.open(ilustracao).convert("RGBA").getchannel("A").resize((max(1, w), max(1, h)))
    rec = alfa.crop((x0 - caixa_ilu[0], y0 - caixa_ilu[1], x1 - caixa_ilu[0], y1 - caixa_ilu[1]))
    opacos = sum(1 for v in rec.tobytes() if v > 128)
    area = (caixa[2] - caixa[0]) * (caixa[3] - caixa[1])
    return opacos / max(1, area)


def _ocr(png):
    if not OCR.exists():
        return None
    r = subprocess.run([str(OCR), str(png)], capture_output=True, text=True, timeout=60)
    return r.stdout if r.returncode == 0 else None


def revisar(pasta, estilo="classico-marfim"):
    """Revisão obrigatória (manual, item 5). Devolve a lista de problemas."""
    from PIL import Image
    pasta = Path(pasta)
    est = render.carregar_estilo(estilo)
    conteudo = json.loads((pasta / "conteudo.json").read_text())
    slides = render.normalizar(conteudo)
    rel = json.loads((pasta / "render.json").read_text()) if (pasta / "render.json").exists() else []
    pngs = sorted(pasta.glob("[0-9][0-9].png"))
    prob = []
    if not 6 <= len(slides) <= 8:
        prob.append(f"{len(slides)} páginas no conteúdo (o padrão é de 6 a 8)")
    nomes = [p.name for p in pngs]
    esperado = [f"{i:02d}.png" for i in range(1, len(slides) + 1)]
    if nomes != esperado:
        prob.append(f"páginas fora de ordem ou faltando: {nomes} (esperado {esperado})")
    hashes = {}
    for p in pngs:
        h = _hash(p)
        if h in hashes:
            prob.append(f"{p.name} é igual a {hashes[h]} (PNG repetido)")
        hashes[h] = p.name
        with Image.open(p) as im:
            if im.size != (est["largura"], est["altura"]):
                prob.append(f"{p.name} tem {im.size[0]}×{im.size[1]} (esperado {est['largura']}×{est['altura']})")
    ultimo = slides[-1] if slides else {}
    if not re.search(r"\b(salve|comente|compartilhe|siga)\b", (ultimo.get("titulo", "") + " " + ultimo.get("texto", "")).lower()):
        prob.append("a última página não tem chamada para ação (salve/comente…)")
    if not (conteudo.get("caption") or "").strip():
        prob.append("sem legenda")
    W, H, m = est["largura"], est["altura"], est["layout"]["margem"]
    for i, (s, r) in enumerate(zip(slides, rel), 1):
        pag = f"página {i:02d}"
        if not s.get("titulo", "").strip():
            prob.append(f"{pag}: sem título")
        # Sem limite de palavras no título: o Davi quer a headline do reel como ele falou
        # (15/10/2026). O que barra é não caber (estouro, abaixo) ou um texto enorme.
        if len((s.get("texto") or "").split()) > 45:
            prob.append(f"{pag}: texto longo demais ({len(s['texto'].split())} palavras)")
        if r.get("estouro_titulo") or r.get("estouro_texto"):
            prob.append(f"{pag}: texto não coube no espaço")
        for nome in ("titulo", "texto"):
            c = r.get(nome)
            if c and (c[0] < m - 12 or c[2] > W - m + 12 or c[3] > H - 60):
                prob.append(f"{pag}: {nome} encosta na margem {c}")
        if r.get("sobre_escultura"):
            prob.append(f"{pag}: texto por cima da ilustração/capa")
        if s.get("capa"):
            try:
                render._ilustracao(s["capa"])
            except FileNotFoundError:
                prob.append(f"{pag}: capa {s['capa']} não encontrada (baixe com capas.py)")
        if r.get("escultura") and s.get("ilustracao") and not s.get("capa"):
            arq = render._ilustracao(s["ilustracao"])
            for c in [r.get("texto")] + (r.get("titulo_linhas") or []):
                if c and _cobertura(arq, r["escultura"], c) > 0.03:
                    prob.append(f"{pag}: texto por cima da escultura")
                    break
        # Texto e acentos: o OCR do macOS lê a página e confere as palavras.
        lido = _ocr(pasta / f"{i:02d}.png")
        if lido is not None:
            lidas = set(_norm(lido))
            faltando = [w for w in _norm(s.get("titulo", "").replace("*", "") + " " + s.get("texto", ""))
                        if len(w) > 3 and w not in lidas]
            if len(faltando) > 2:
                prob.append(f"{pag}: OCR não achou {faltando[:5]}")
    return prob


# ------------------------------------------------------------------ entrega
def _pasta_de(alvo):
    p = Path(alvo)
    if p.is_dir():
        return p
    return TRABALHO / alvo


def _supabase():
    env = dict(l.split("=", 1) for l in (RAIZ / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    url = env.get("VITE_SUPABASE_URL", "").strip().strip('"')
    chave = env.get("VITE_SUPABASE_PUBLISHABLE_KEY", "").strip().strip('"')
    if not (url and chave):
        raise SystemExit("Falta VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY no .env.")
    return url, chave


TIPOS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf"}


def enviar_storage(id_, pngs, assets=()):
    """Sobe as páginas com a chave pública: o Storage só aceita na pasta do
    token sorteado agora, e só enquanto o carrossel está 'produzindo'
    (migração 20261014070000_carrosseis_envio)."""
    token = db("UPDATE public.carrosseis SET token_envio = gen_random_uuid() WHERE id = %s AND status = 'produzindo' "
               "RETURNING token_envio", (id_,))
    if not token:
        raise RuntimeError("o carrossel não está em produção; não dá para enviar páginas")
    url, chave = _supabase()
    pasta = f"{CLIENTE}/{id_}/{token[0][0]}"

    def subir(arquivo, caminho):
        req = urllib.request.Request(f"{url}/storage/v1/object/carrosseis/{caminho}", data=Path(arquivo).read_bytes(), method="POST",
                                     headers={"Authorization": f"Bearer {chave}", "apikey": chave,
                                              "Content-Type": TIPOS.get(Path(caminho).suffix.lower(), "image/png")})
        with urllib.request.urlopen(req, context=instagram._ssl(), timeout=120):
            pass

    urls = []
    for p in pngs:
        subir(p, f"{pasta}/{p.name}")
        urls.append(f"{url}/storage/v1/object/public/carrosseis/{pasta}/{p.name}")
    # Fontes e ilustrações do molde (prévia ao vivo na revisão).
    for nome, local in {nome: local for local, nome in assets}.items():  # cada arquivo uma vez
        subir(local, f"{pasta}/assets/{nome}")
    return urls, f"{url}/storage/v1/object/public/carrosseis/{pasta}/assets"


def _nome_pasta(numero, tema, dia):
    tema = re.sub(r'[/:*?"<>|]', "", tema).strip()
    return f"{numero:03d} - {dia} - {tema}"


def _gravar_no_drive(origem, destino, tentativas=6):
    """O Google Drive do Mac às vezes trava um arquivo enquanto sincroniza
    (Errno 11, "Resource deadlock avoided"). Tenta de novo com calma e, se
    precisar, apaga o antigo e grava por um arquivo temporário."""
    import errno
    import os
    import time
    destino = Path(destino)
    for i in range(tentativas):
        try:
            tmp = destino.with_name(f".{destino.name}.roy-tmp")
            shutil.copyfile(origem, tmp)
            os.replace(tmp, destino)
            return
        except OSError as e:
            if e.errno not in (errno.EDEADLK, errno.EBUSY, errno.EAGAIN, errno.EPERM, errno.EACCES) or i == tentativas - 1:
                raise
            time.sleep(2 * (i + 1))
            try:
                destino.unlink(missing_ok=True)
            except OSError:
                pass


def _escrever_no_drive(texto, destino):
    import tempfile
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as f:
        f.write(texto)
    try:
        _gravar_no_drive(f.name, destino)
    finally:
        Path(f.name).unlink(missing_ok=True)


def salvar_drive(id_, pasta, conteudo, numero, versao, estado):
    if not DRIVE.is_dir():
        raise SystemExit(f"Pasta do Drive não encontrada: {DRIVE}")
    existente = next(iter(DRIVE.glob(f"{numero:03d} - *")), None)
    destino = existente or DRIVE / _nome_pasta(numero, conteudo["theme"], date.today().isoformat())
    certo = destino.with_name(_nome_pasta(numero, conteudo["theme"], destino.name[6:16]))
    if destino != certo:  # o tema mudou num ajuste
        destino.rename(certo)
        destino = certo
    destino.mkdir(exist_ok=True)
    for velho in destino.glob("[0-9][0-9].png"):
        velho.unlink()
    pngs = sorted(pasta.glob("[0-9][0-9].png"))
    for p in pngs:
        _gravar_no_drive(p, destino / p.name)
    _gravar_no_drive(pasta / "conteudo.json", destino / "conteudo.json")
    _escrever_no_drive(conteudo["caption"].strip() + "\n", destino / "legenda.txt")
    if (pasta / "transcricao.txt").exists():
        _gravar_no_drive(pasta / "transcricao.txt", destino / "transcricao.txt")
    fonte = json.loads((pasta / "fonte.json").read_text())
    linhas = [
        "Perfil: @eu.davioficial", f"Tema: {conteudo['theme']}", f"Fonte: {fonte.get('permalink')}",
        f"ID da fonte: {fonte['id']}", f"Data real da fonte: {fonte['timestamp']}",
        f"Legenda da fonte: {(fonte.get('caption') or '').splitlines()[0] if fonte.get('caption') else ''}",
        f"Estado da criação: {estado}", f"Versão: {versao}",
        f"Imagens: {len(pngs)} páginas individuais e diferentes, 1080×1350, conferidas pela revisão automática do Roy",
        "Estado da publicação: NÃO PUBLICADO — aguardando aprovação do Davi no Infopro e programação da Dalila",
        f"Registro no Infopro: carrosseis.id = {id_}",
        "Criado pelo Roy (Claude + Infopro). Transcrição: mlx-whisper large-v3-turbo, local. Ilustrações: OpenAI (gpt-image).",
    ] + _fontes_das_capas(conteudo) + [
        "Arquivos em ordem:",
    ] + [f"{p.name} | SHA256: {_hash(p)}" for p in pngs]
    _escrever_no_drive("\n".join(linhas) + "\n", destino / "referencia.txt")
    # Confere que tudo chegou ao Drive antes de seguir (manual, item 6).
    for p in pngs:
        if _hash(destino / p.name) != _hash(p):
            raise OSError(f"{p.name} não chegou certo no Drive")
    return destino


def _fontes_das_capas(conteudo):
    linhas = []
    for s in render.normalizar(conteudo):
        info = render.ILUSTRACOES / f"{s.get('capa')}.json"
        if s.get("capa") and info.exists():
            i = json.loads(info.read_text())
            linhas.append(f"Capa real: {i.get('titulo')} ({i.get('ano') or 's/ ano'}) · {i.get('fonte')} · {i.get('link') or i.get('imagem')}")
    return sorted(set(linhas))


def renderizar(alvo, estilo="classico-marfim", drive=True, nova_versao=False):
    pasta = _pasta_de(alvo)
    id_ = pasta.name
    linha = db("SELECT numero, versao, status FROM public.carrosseis WHERE id = %s", (id_,))
    if not linha:
        raise SystemExit(f"Carrossel {id_} não está no Infopro.")
    numero, versao, status = linha[0]
    if nova_versao or status in ("revisar", "ajuste"):  # nova versão depois de um pedido de ajuste
        versao += 1
    conteudo = json.loads((pasta / "conteudo.json").read_text())
    db("UPDATE public.carrosseis SET status = 'produzindo', mensagem = 'Montando as páginas…', atualizado_em = now() WHERE id = %s", (id_,))
    render.renderizar(pasta, estilo)
    prob = revisar(pasta, estilo)
    if prob:
        print("REVISÃO REPROVOU:")
        for p in prob:
            print(" -", p)
        # Fica vermelho no mapa: a revisão automática barrou.
        db("UPDATE public.carrosseis SET status = 'erro', mensagem = %s, atualizado_em = now() WHERE id = %s",
           ("Revisão automática: " + "; ".join(prob)[:400], id_))
        return False
    print("Revisão automática: ok")
    # O que gerou estas páginas: os ajustes da tela (que citam "03/08") partem
    # sempre daqui, então refazer um ajuste dá o mesmo resultado.
    shutil.copyfile(pasta / "conteudo.json", pasta / "conteudo.renderizado.json")
    pngs = sorted(pasta.glob("[0-9][0-9].png"))
    destino = None
    if drive:
        # O Drive não pode travar o carrossel: se falhar, segue e o serviço tenta de novo depois.
        try:
            destino = salvar_drive(id_, pasta, conteudo, numero, versao, "CONCLUÍDO E REVISADO PELO ROY — AGUARDANDO O DAVI")
            (pasta / "drive_pendente").unlink(missing_ok=True)
        except OSError as e:
            (pasta / "drive_pendente").write_text(json.dumps({"versao": versao, "erro": str(e)[:300]}))
            print("Drive falhou, fica pendente:", e)
    est_json = render.carregar_estilo(estilo)
    slides_r = render.normalizar(conteudo)
    assets = [a for s_ in slides_r for a in render.assets_da_pagina(est_json, s_)]
    urls, base_assets = enviar_storage(id_, pngs, assets)
    modelos = [render.pagina_html(est_json, s_, i, len(slides_r), assets=base_assets, marcadores=True)
               for i, s_ in enumerate(slides_r, 1)]
    est = db("SELECT id FROM public.estilos_carrossel WHERE cliente_id = %s AND nome = %s",
             (CLIENTE, render.carregar_estilo(estilo)["nome"]))
    slides = [{"titulo": s["titulo"], "texto": s.get("texto", ""), "pagina": f"{i:02d}/{len(pngs):02d}",
               **({"opcoes": s["opcoes"]} if s.get("opcoes") else {})}
              for i, s in enumerate(render.normalizar(conteudo), 1)]
    db("""UPDATE public.carrosseis SET status = 'revisar', mensagem = null, tema = %s, slides = %s, legenda = %s,
              paginas = %s, modelos = %s, versao = %s, pasta_drive = coalesce(%s, pasta_drive), estilo_id = coalesce(%s, estilo_id),
              atualizado_em = now() WHERE id = %s""",
       (conteudo["theme"], json.dumps(slides, ensure_ascii=False), conteudo["caption"], urls, modelos, versao,
        str(destino) if destino else None, est[0][0] if est else None, id_))
    print(f"Pronto para o Davi revisar (versão {versao}). Drive: {destino}")
    return True


def concluir_tarefa_roy(atividade_roy_id):
    """A tarefa que o Davi passou pro Roy termina quando todos os carrosséis
    dela forem aprovados (o mesmo que src/lib/empresa/aprovarCarrossel.ts faz)."""
    if not atividade_roy_id:
        return False
    faltam = db("SELECT count(*) FROM public.carrosseis WHERE atividade_roy_id = %s "
                "AND status NOT IN ('aprovado', 'programado', 'publicado')", (atividade_roy_id,))[0][0]
    if faltam:
        return False
    db("""UPDATE public.atividades a SET situacao = 'concluida', concluida = true, progresso = 100,
              observacao = 'Carrossel aprovado pelo Davi e enviado para a Dalila programar.',
              status = coalesce((SELECT status_key FROM public.colunas_atividade c
                                 WHERE c.cliente_id = a.cliente_id AND c.eh_conclusao ORDER BY ordem LIMIT 1), a.status)
          WHERE id = %s AND NOT concluida""", (atividade_roy_id,))
    return True


def aprovar(id_):
    """O Davi já aprovou (só excluiu páginas/editou texto): depois de remontar,
    aprova e cria a tarefa "Programar carrossel" da Dalila — o mesmo que o app
    faz em src/lib/empresa/aprovarCarrossel.ts."""
    numero, tema, paginas, legenda, pasta_drive, atividade = db(
        "SELECT numero, tema, paginas, legenda, pasta_drive, atividade_id FROM public.carrosseis WHERE id = %s", (id_,))[0]
    dalila = db("""SELECT id, setor_id, nome FROM public.membros WHERE cliente_id = %s AND ativo AND NOT eh_ia
                     AND (lower(nome) = 'dalila' OR funcao ILIKE '%%social%%')
                   ORDER BY (lower(nome) = 'dalila') DESC, (funcao ILIKE '%%social%%') DESC LIMIT 1""", (CLIENTE,))
    dalila = dalila[0] if dalila else None
    if dalila and not atividade:
        coluna = db("SELECT status_key FROM public.colunas_atividade WHERE cliente_id = %s AND NOT eh_conclusao "
                    "ORDER BY ordem LIMIT 1", (CLIENTE,))
        pasta = db("SELECT id FROM public.pastas_atividade WHERE cliente_id = %s AND deleted_at IS NULL ORDER BY ordem LIMIT 1",
                   (CLIENTE,))
        if not pasta:
            pasta = db("INSERT INTO public.pastas_atividade (nome, cliente_id, ordem, origem) VALUES ('Geral', %s, 0, 'atividades') "
                       "RETURNING id", (CLIENTE,))
        dono = db("SELECT user_id FROM public.clientes WHERE id = %s", (CLIENTE,))[0][0]
        titulo = f"Programar carrossel: {f'{numero:03d} · ' if numero else ''}{tema} ({len(paginas)} páginas)"
        descricao = "\n".join(["Carrossel do Roy aprovado pelo Davi. Programar 1 por dia, às 10h.",
                               f"Páginas no Drive: {pasta_drive}" if pasta_drive else "",
                               *[f"{i:02d}: {u}" for i, u in enumerate(paginas, 1)], f"\nLegenda:\n{legenda or ''}"])
        atividade = db("""INSERT INTO public.atividades (titulo, cliente_id, pasta_id, data_atividade, status, concluida, ordem,
                            prioridade, responsavel_id, setor_id, situacao, tipo, descricao, user_id)
                          VALUES (%s, %s, %s, current_date, %s, false, 0, 'media', %s, %s, 'fila', 'programacao', %s, %s)
                          RETURNING id""",
                       (titulo, CLIENTE, pasta[0][0], coluna[0][0] if coluna else "backlog", dalila[0], dalila[1],
                        descricao.replace("\n\n\n", "\n\n"), dono))[0][0]

    db("""UPDATE public.carrosseis SET status = 'aprovado', revisado_em = now(), atividade_id = %s, aprovar_apos_ajuste = false,
              mensagem = %s, atualizado_em = now() WHERE id = %s""",
       (atividade, f"Aprovado pelo Davi ({len(paginas)} páginas) e enviado para {dalila[2] if dalila else 'programar'}", id_))
    # Tarefa de origem (do Roy) concluída quando todos os carrosséis dela forem aprovados.
    concluir_tarefa_roy(db("SELECT atividade_roy_id FROM public.carrosseis WHERE id = %s", (id_,))[0][0])
    # Drive: o referencia.txt passa a dizer que foi aprovado (se o Drive deixar).
    ref = Path(pasta_drive or "") / "referencia.txt"
    if pasta_drive and ref.exists():
        try:
            texto = re.sub(r"^Estado da criação: .*$", "Estado da criação: APROVADO PELO DAVI — COM A DALILA PARA PROGRAMAR",
                           ref.read_text(), flags=re.M)
            _escrever_no_drive(texto, ref)
        except OSError:
            pass
    return dalila[2] if dalila else None


def drive_pendentes():
    """Pastas que o Drive não deixou gravar: tenta de novo (serviço do Roy)."""
    feitos = 0
    for marca in TRABALHO.glob("*/drive_pendente"):
        pasta = marca.parent
        linha = db("SELECT numero, versao, status FROM public.carrosseis WHERE id = %s", (pasta.name,))
        if not linha:
            continue
        numero, versao, status = linha[0]
        estado = "APROVADO PELO DAVI — COM A DALILA PARA PROGRAMAR" if status == "aprovado" else "CONCLUÍDO E REVISADO PELO ROY — AGUARDANDO O DAVI"
        destino = salvar_drive(pasta.name, pasta, json.loads((pasta / "conteudo.json").read_text()), numero, versao, estado)
        db("UPDATE public.carrosseis SET pasta_drive = %s WHERE id = %s", (str(destino), pasta.name))
        marca.unlink()
        feitos += 1
    return feitos


def ajustes(so_id=None):
    """Traz pro conteudo.json o que o Davi mexeu na tela (textos, legenda,
    páginas excluídas). `so_id`: um carrossel só, já com status qualquer."""
    sql = ("SELECT id, tema, feedback, slides, legenda FROM public.carrosseis WHERE id = %s" if so_id else
           "SELECT id, tema, feedback, slides, legenda FROM public.carrosseis WHERE cliente_id = %s AND status = 'ajuste' "
           "ORDER BY atualizado_em")
    for id_, tema, fb, slides, legenda in db(sql, (so_id or CLIENTE,)) or []:
        print(f"== {id_} · {tema}\nPedido do Davi: {fb or '(sem texto)'}")
        # O Davi pode ter corrigido texto direto na tela: traz pro conteudo.json.
        pasta = TRABALHO / str(id_)
        arq = pasta / "conteudo.json"
        if arq.exists() and slides:
            base_arq = pasta / "conteudo.renderizado.json"
            c = json.loads((base_arq if base_arq.exists() else arq).read_text())
            atuais = render.normalizar(c)
            novos = []
            # Cada slide da tela traz a "pagina" de onde veio (ex.: "03/08"): casa por ela,
            # assim páginas excluídas na tela somem e as outras mantêm ilustração/capa.
            for novo in slides if isinstance(slides, list) else json.loads(slides):
                n = int(str(novo.get("pagina", "0"))[:2] or 0)
                base = dict(atuais[n - 1]) if 1 <= n <= len(atuais) else {}
                base["titulo"], base["texto"] = novo.get("titulo", base.get("titulo", "")), novo.get("texto", base.get("texto", ""))
                novos.append(base)
            if len(novos) != len(atuais):
                print(f"({len(atuais) - len(novos)} página(s) excluída(s) na tela)")
            c["slides"], c["caption"] = novos, legenda or c["caption"]
            arq.write_text(json.dumps(c, ensure_ascii=False, indent=1))
            print(f"(textos da tela copiados para {arq})")


def pedir_ajuste(id_, pedido):
    """Pedido de ajuste vindo da CONVERSA da revisão (16/10): o mesmo que o botão "Pedir
    ajuste" da tela — o carrossel volta para 'ajuste' e o serviço do Roy refaz e manda a
    nova versão para revisar (a tela da revisão troca sozinha)."""
    pedido = pedido.strip()
    if not pedido:
        raise SystemExit("Escreva o pedido (stdin).")
    r = db("""UPDATE public.carrosseis SET status = 'ajuste', feedback = %s, aprovar_apos_ajuste = false, atualizado_em = now()
               WHERE id = %s AND status IN ('revisar', 'erro') RETURNING numero""", (pedido[:2000], id_))
    print(f"AJUSTE PEDIDO (carrossel {r[0][0]}): o serviço do Roy refaz em alguns minutos" if r
          else "não deu: o carrossel não está em revisão (veja o status)")


def estilos():
    for arq in sorted((AQUI / "estilos").glob("*.json")):
        e = json.loads(arq.read_text())
        db("""INSERT INTO public.estilos_carrossel (cliente_id, nome, descricao, parametros)
              VALUES (%s, %s, %s, %s)
              ON CONFLICT (cliente_id, nome) DO UPDATE SET descricao = excluded.descricao,
                parametros = excluded.parametros, atualizado_em = now()""",
           (CLIENTE, e["nome"], e.get("descricao"), json.dumps(e, ensure_ascii=False)))
        print("estilo gravado:", e["nome"])


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    estilo = a[a.index("--estilo") + 1] if "--estilo" in a else "classico-marfim"
    if a[0] == "candidatos":
        for r in candidatos(int(a[1]) if len(a) > 1 else 10):
            print(r["timestamp"][:10], r["id"], (r.get("caption") or "").split("\n")[0][:80])
    elif a[0] == "iniciar":
        iniciar(a[1], a[a.index("--tarefa") + 1] if "--tarefa" in a else None)
    elif a[0] == "renderizar":
        sys.exit(0 if renderizar(a[1], estilo, drive="--sem-drive" not in a) else 1)
    elif a[0] == "revisar":
        p = revisar(_pasta_de(a[1]), estilo)
        print("\n".join(p) if p else "ok")
    elif a[0] == "ajustes":
        ajustes()
    elif a[0] == "pedir-ajuste" and len(a) > 1:
        pedir_ajuste(a[1], sys.stdin.read())
    elif a[0] == "estilos":
        estilos()
    else:
        raise SystemExit(__doc__)
