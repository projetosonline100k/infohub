# Modo Creator do Jarvis: transcreve um vídeo a partir do link (Instagram,
# TikTok, YouTube…). Baixa só o áudio com yt-dlp e transcreve com Whisper
# rodando no Mac (mlx-whisper, otimizado pros chips da Apple).
#
# Roda como "trabalhador" contínuo, com PYTHONPATH=~/.infopro-hub/creator
# (yt-dlp, mlx-whisper e imageio-ffmpeg instalados lá). Embutido no app e
# controlado por src-tauri/src/creator.rs:
#   entrada (stdin), um JSON por linha: {"id": "...", "url": "https://...",
#                                        "modo": "preciso" | "rapido"}
#   saída (stdout), um JSON por linha:  {"id", "texto", "idioma", "titulo",
#                                        "autor", "duracao", "segundos"} ou {"id", "erro"}
# O modelo carrega uma vez e fica na memória; depois de 10 min sem pedido o
# processo sai sozinho pra devolver a memória (o Mac do Davi tem 8 GB).
import json
import os
import select
import sys
import tempfile
import time

# Medido no M1 do Davi com um reel de ~45s: "preciso" ~8,5s (o melhor
# texto); "rapido" ~3s, acertando ~85% das mesmas palavras.
MODELOS = {
    "preciso": "mlx-community/whisper-large-v3-turbo",
    "rapido": "mlx-community/whisper-small-mlx",
}
OCIOSO_MAX_S = 60 * 60   # 19/10: o ditado sofria ~10 s recarregando o modelo depois de 10 min parado
SAIDA = sys.stdout
# Nada de bibliotecas escrevendo no stdout: ele é só das respostas em JSON.
sys.stdout = sys.stderr


def responder(dados):
    SAIDA.write(json.dumps(dados, ensure_ascii=False) + "\n")
    SAIDA.flush()


def preparar_ffmpeg():
    # mlx-whisper chama "ffmpeg" pelo PATH; o binário vem do imageio-ffmpeg.
    import imageio_ffmpeg
    pasta = os.path.expanduser("~/.infopro-hub/creator-bin")
    os.makedirs(pasta, exist_ok=True)
    link = os.path.join(pasta, "ffmpeg")
    if not os.path.exists(link):
        os.symlink(imageio_ffmpeg.get_ffmpeg_exe(), link)
    os.environ["PATH"] = pasta + os.pathsep + os.environ.get("PATH", "")
    return link


# Conta reserva do Instagram logada num perfil separado do Chrome: logado, o
# Instagram mostra as views (deslogado, não). O arquivo guarda o nome da pasta
# do perfil (ex.: "Profile 3"). Nunca a conta principal: acesso automatizado
# pode levar bloqueio.
PERFIL_INSTAGRAM = os.path.expanduser("~/.infopro-hub/instagram-perfil-chrome")


def perfil_instagram(url):
    if "instagram.com" not in url:
        return None
    try:
        with open(PERFIL_INSTAGRAM) as f:
            return f.read().strip() or None
    except OSError:
        return None


def ensinar_views_instagram():
    # Logado, o Instagram manda as views em "play_count", mas o yt-dlp não
    # repassa esse campo. Copia pra view_count do resultado.
    from yt_dlp.extractor.instagram import InstagramIE
    original = InstagramIE._extract_product

    def extrair(self, produto, *a, **k):
        info = original(self, produto, *a, **k)
        views = produto.get("play_count") or produto.get("ig_play_count") or produto.get("view_count")
        if isinstance(info, dict) and views and not info.get("view_count"):
            info["view_count"] = views
        return info

    InstagramIE._extract_product = extrair


def baixar_capa(info):
    """Capa do vídeo em base64 (o app guarda no Storage: o link do Instagram
    expira em poucos dias). None se não tiver ou falhar."""
    url = info.get("thumbnail")
    if not url:
        return None
    try:
        import base64
        import requests
        r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        if len(r.content) > 1_800_000:
            return None
        return {"base64": base64.b64encode(r.content).decode(), "tipo": r.headers.get("content-type", "image/jpeg").split(";")[0]}
    except Exception as e:
        print(f"capa: {e}", file=sys.stderr, flush=True)
        return None


def traduzir(texto):
    """Tradução pro português (Google Tradutor, grátis). Usada pelo "Separar
    ideias": a janela do Jarvis não consegue chamar o Google direto."""
    import requests
    r = requests.post(
        "https://translate.googleapis.com/translate_a/single",
        params={"client": "gtx", "sl": "auto", "tl": "pt", "dt": "t"},
        data={"q": texto}, timeout=30,
    )
    r.raise_for_status()
    dados = r.json()
    linhas = dados[0] if isinstance(dados, list) and dados and isinstance(dados[0], list) else []
    return {
        "texto": "".join(l[0] for l in linhas if isinstance(l, list) and isinstance(l[0], str)),
        "idioma": dados[2] if isinstance(dados, list) and len(dados) > 2 and isinstance(dados[2], str) else None,
    }


def _data_iso(yyyymmdd):
    if not yyyymmdd or len(str(yyyymmdd)) != 8:
        return None
    d = str(yyyymmdd)
    return f"{d[:4]}-{d[4:6]}-{d[6:]}"


def baixar(url, opcoes):
    """Baixa com o yt-dlp; no Instagram tenta antes logado na conta reserva."""
    import yt_dlp
    perfil = perfil_instagram(url)
    if perfil:
        try:
            with yt_dlp.YoutubeDL({**opcoes, "cookiesfrombrowser": ("chrome", perfil)}) as ydl:
                return ydl.extract_info(url, download=True) or {}
        except Exception as e:  # sessão caiu: segue deslogado (sem views)
            print(f"instagram logado falhou: {e}", file=sys.stderr, flush=True)
    with yt_dlp.YoutubeDL(opcoes) as ydl:
        return ydl.extract_info(url, download=True) or {}


def duracao_do_arquivo(ffmpeg, arquivo):
    """Segundos do arquivo (o Instagram nem sempre informa a duração)."""
    import re
    import subprocess
    try:
        r = subprocess.run([ffmpeg, "-i", arquivo], capture_output=True, text=True, timeout=30)
        h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr).groups()
        return int(h) * 3600 + int(m) * 60 + float(s)
    except Exception:
        return None


def sem_fala(texto, resultado, duracao):
    """Reel só com música/texto na tela: o Whisper devolve "Thank you.",
    meia dúzia de palavras ou trecho de letra de música."""
    import re
    limpo = re.sub(r"[^\w\s]|\d|_", " ", texto).strip().lower()
    palavras = limpo.split()
    if len(palavras) < 6 or re.fullmatch(r"(thank you\s*)+", limpo):
        return True
    if max(len(p) for p in palavras) > 30:  # Whisper "alucinando" (letra repetida)
        return True
    if duracao and len(palavras) / duracao < 0.8:  # fala normal: ~2,5 palavras/s
        return True
    segmentos = resultado.get("segments") or []
    if segmentos:
        sem_voz = sum(s.get("no_speech_prob") or 0 for s in segmentos) / len(segmentos)
        if sem_voz > 0.5:
            return True
    return False


# Leitura do texto da tela com o Vision do macOS (o mesmo OCR do "Texto ao
# Vivo" das fotos). Compila uma vez em ~/.infopro-hub/creator-bin.
OCR_SWIFT = r'''
import Foundation
import Vision
import AppKit
for caminho in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: caminho)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print(""); continue }
    let pedido = VNRecognizeTextRequest()
    pedido.recognitionLevel = .accurate
    pedido.recognitionLanguages = ["pt-BR", "en-US", "es-ES"]
    pedido.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: img, options: [:]).perform([pedido])
    let linhas = (pedido.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    print(linhas.joined(separator: " "))
}
'''


def ocr_binario():
    import hashlib
    import subprocess
    versao = hashlib.sha1(OCR_SWIFT.encode()).hexdigest()[:8]
    pasta = os.path.expanduser("~/.infopro-hub/creator-bin")
    binario = os.path.join(pasta, f"ocr-tela-{versao}")
    if not os.path.exists(binario):
        fonte = os.path.join(pasta, "ocr-tela.swift")
        with open(fonte, "w") as f:
            f.write(OCR_SWIFT)
        subprocess.run(["swiftc", "-O", "-o", binario, fonte], check=True, capture_output=True, timeout=180)
    return binario


def texto_da_tela(url, ffmpeg, duracao):
    """Baixa o vídeo (sem áudio), tira 3 quadros e lê o texto de cada um.
    O 1º quadro costuma ter o gancho: vira a 1ª linha (a headline). Devolve
    "" se não der."""
    import subprocess
    try:
        with tempfile.TemporaryDirectory(prefix="jarvis-creator-tela-") as pasta:
            opcoes = {
                "format": "bv*[height<=1080]/b",
                "outtmpl": os.path.join(pasta, "video.%(ext)s"),
                "quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
                "ffmpeg_location": ffmpeg,
            }
            baixar(url, opcoes)
            video = next(os.path.join(pasta, f) for f in os.listdir(pasta) if f.startswith("video."))
            momentos = [0.5, duracao * 0.35, duracao * 0.7] if duracao else [0.5, 3, 6]
            quadros = []
            for n, t in enumerate(momentos):
                quadro = os.path.join(pasta, f"q{n}.png")
                subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", quadro],
                               capture_output=True, timeout=60)
                if os.path.exists(quadro):
                    quadros.append(quadro)
            if not quadros:
                return ""
            saida = subprocess.run([ocr_binario(), *quadros], capture_output=True, text=True, timeout=120).stdout
        # Um quadro por linha; o mesmo texto em quadros seguidos (só com uma
        # palavra a mais) fica uma vez só, na versão mais completa.
        frases = []
        for linha in saida.splitlines():
            linha = linha.strip()
            if not linha or any(linha.lower() in f.lower() for f in frases):
                continue
            contida = next((i for i, f in enumerate(frases) if f.lower() in linha.lower()), None)
            if contida is None:
                frases.append(linha)
            else:
                frases[contida] = linha
        return "\n".join(frases)
    except Exception as e:
        print(f"texto da tela: {e}", file=sys.stderr, flush=True)
        return ""


def transcrever(url, ffmpeg, modo="preciso"):
    import mlx_whisper

    inicio = time.time()
    if modo == "capa":
        # Só a capa (e as views), sem baixar nem transcrever: completa
        # referências antigas que chegaram sem imagem.
        import yt_dlp as _y
        perfil = perfil_instagram(url)
        opcoes = {"quiet": True, "no_warnings": True, "skip_download": True}
        if perfil:
            opcoes["cookiesfrombrowser"] = ("chrome", perfil)
        try:
            with _y.YoutubeDL(opcoes) as ydl:
                info = ydl.extract_info(url, download=False) or {}
        except Exception as e:
            return {"erro": f"Não consegui abrir o post: {str(e)[:200]}"}
        return {"texto": "", "capa": baixar_capa(info), "visualizacoes": info.get("view_count")}
    with tempfile.TemporaryDirectory(prefix="jarvis-creator-") as pasta:
        opcoes = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(pasta, "audio.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "noplaylist": True,
            "ffmpeg_location": ffmpeg,
        }
        try:
            info = baixar(url, opcoes)
        except Exception as e:  # link privado, removido, pedindo login…
            msg = str(e)
            if "Sign in" in msg or "login" in msg.lower():
                return {"erro": "Esse site pediu login para liberar o vídeo. Tente outro link (reels públicos funcionam)."}
            return {"erro": f"Não consegui baixar o vídeo: {msg[:240]}"}
        arquivos = [os.path.join(pasta, f) for f in os.listdir(pasta)]
        if not arquivos:
            return {"erro": "O vídeo não tem áudio para transcrever."}
        baixou = time.time()
        duracao = info.get("duration") or duracao_do_arquivo(ffmpeg, arquivos[0])
        modelo = MODELOS.get(modo, MODELOS["preciso"])
        resultado = mlx_whisper.transcribe(arquivos[0], path_or_hf_repo=modelo, verbose=None)
        print(f"tempo: download {baixou - inicio:.1f}s, transcrição {time.time() - baixou:.1f}s", file=sys.stderr, flush=True)

    texto = (resultado.get("text") or "").strip()
    origem = "fala"
    # Sem fala: o texto da tela substitui. Fala curta (pode ser letra de
    # música): se a tela tem mais texto, ele vem antes (vira a headline).
    nada = sem_fala(texto, resultado, duracao)
    if nada or len(texto.split()) < 25:
        tela = texto_da_tela(url, ffmpeg, duracao)
        if len(tela.split()) >= 4 and (nada or len(tela.split()) > len(texto.split())):
            texto, origem = (tela if nada else f"{tela}\n\n{texto}"), "tela"

    return {
        "texto": texto,
        "origem": origem,
        "idioma": resultado.get("language"),
        "titulo": info.get("title") or (info.get("description") or "")[:80] or None,
        "autor": info.get("uploader") or info.get("channel"),
        "duracao": duracao,
        # Pras "Ideias em destaque" do cliente (views e data, quando o site informa).
        "visualizacoes": info.get("view_count") or info.get("play_count"),
        "curtidas": info.get("like_count"),
        "comentarios": info.get("comment_count"),
        "data_publicacao": _data_iso(info.get("upload_date")),
        "capa": baixar_capa(info),
        "segundos": round(time.time() - inicio, 1),
        "modo": modo,
    }


def transcrever_voz(caminho):
    """Comando de voz da orbe (⌥+Espaço): arquivo local, sempre português.
    O vocabulário ajuda o Whisper com os nomes do dia a dia do Davi."""
    import mlx_whisper
    if not os.path.exists(caminho):
        return {"erro": "Áudio não encontrado."}
    inicio = time.time()
    resultado = mlx_whisper.transcribe(
        caminho, path_or_hf_repo=MODELOS["preciso"], language="pt", verbose=None,
        initial_prompt="Infopro, Jarvis, Claude, Danilo, Dalila, Roy, Supabase, Premiere, reels, legenda, timeline, deploy.")
    texto = (resultado.get("text") or "").strip()
    print(f"voz: {time.time() - inicio:.1f}s", file=sys.stderr, flush=True)
    return {"texto": texto, "segundos": round(time.time() - inicio, 1)}


def transcrever_trechos(caminho):
    """Áudio gravado no documento (18/10): texto + trechos com o tempo de cada um, para o player
    pular para o ponto clicado. Português, mesmo modelo do modo voz."""
    import mlx_whisper
    if not os.path.exists(caminho):
        return {"erro": "Áudio não encontrado."}
    r = mlx_whisper.transcribe(caminho, path_or_hf_repo=MODELOS["preciso"], language="pt", verbose=None,
                               word_timestamps=True,
                               initial_prompt="Infopro, Claude, Danilo, Dalila, Roy, reels, roteiro, headline.")
    # Trechos por frase (ou a cada 14 palavras): fino o bastante para clicar e pular.
    trechos, atual = [], []
    def fechar():
        if atual:
            trechos.append({"inicio": round(float(atual[0]["start"]), 2), "fim": round(float(atual[-1]["end"]), 2),
                            "texto": "".join(p["word"] for p in atual).strip()})
            atual.clear()
    for seg in r.get("segments") or []:
        for p in seg.get("words") or []:
            atual.append(p)
            if p["word"].strip()[-1:] in ".!?…" or len(atual) >= 14:
                fechar()
    fechar()
    if not trechos:
        trechos = [{"inicio": round(float(s.get("start") or 0), 2), "fim": round(float(s.get("end") or 0), 2),
                    "texto": (s.get("text") or "").strip()} for s in (r.get("segments") or []) if (s.get("text") or "").strip()]
    return {"texto": (r.get("text") or "").strip(), "trechos": trechos}


def buscar_youtube(termo):
    """Radar de virais (18/10): busca no YouTube pelo yt-dlp, sem baixar nada — views reais.
    Devolve os 60 primeiros da busca, ordenados por views (o app filtra os curtos)."""
    import yt_dlp
    termo = (termo or "").strip()
    if not termo:
        return {"erro": "Escreva um tema para buscar."}
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}) as ydl:
        r = ydl.extract_info(f"ytsearch60:{termo}", download=False)
    videos = []
    for e in r.get("entries") or []:
        if not e or not e.get("id"):
            continue
        thumbs = e.get("thumbnails") or []
        videos.append({
            "plataforma": "youtube",
            "link": e.get("url") or f"https://www.youtube.com/watch?v={e['id']}",
            "titulo": e.get("title") or "",
            "criador": e.get("channel") or e.get("uploader"),
            "visualizacoes": e.get("view_count"),
            "duracao": e.get("duration"),
            "capa_url": thumbs[-1]["url"] if thumbs else f"https://i.ytimg.com/vi/{e['id']}/hqdefault.jpg",
        })
    videos.sort(key=lambda v: -(v["visualizacoes"] or 0))
    return {"videos": videos}


def main():
    ffmpeg = preparar_ffmpeg()
    try:
        ensinar_views_instagram()
    except Exception as e:  # yt-dlp mudou por dentro: segue sem views
        print(f"views do instagram: {e}", file=sys.stderr, flush=True)
    while True:
        prontos, _, _ = select.select([sys.stdin], [], [], OCIOSO_MAX_S)
        if not prontos:
            return  # ocioso demais: sai e libera a memória do modelo
        linha = sys.stdin.readline()
        if not linha:
            return  # o app fechou
        try:
            pedido = json.loads(linha)
        except ValueError:
            continue
        id_ = pedido.get("id")
        if pedido.get("modo") == "traduzir":
            try:
                responder({"id": id_, **traduzir(pedido.get("url") or "")})
            except Exception as e:
                responder({"id": id_, "erro": f"Tradutor não respondeu: {str(e)[:200]}"})
            continue
        if pedido.get("modo") == "voz_trechos":
            try:
                responder({"id": id_, **transcrever_trechos(pedido.get("url") or "")})
            except Exception as e:
                responder({"id": id_, "erro": f"Não consegui transcrever o áudio: {str(e)[:200]}"})
            continue
        if pedido.get("modo") == "buscar_youtube":
            try:
                responder({"id": id_, **buscar_youtube(pedido.get("url") or "")})
            except Exception as e:
                responder({"id": id_, "erro": f"A busca no YouTube falhou: {str(e)[:200]}"})
            continue
        if pedido.get("modo") == "aquecer":
            # Ditado (18/10): o Davi segurou ⌘ — carrega o modelo enquanto ele fala.
            try:
                import mlx.core as mx
                from mlx_whisper.transcribe import ModelHolder
                ModelHolder.get_model(MODELOS["preciso"], mx.float16)
                responder({"id": id_, "ok": True})
            except Exception as e:
                responder({"id": id_, "erro": f"Não consegui aquecer: {str(e)[:200]}"})
            continue
        if pedido.get("modo") == "voz":
            try:
                responder({"id": id_, **transcrever_voz(pedido.get("url") or "")})
            except Exception as e:
                responder({"id": id_, "erro": f"Não consegui entender o áudio: {str(e)[:200]}"})
            continue
        url = (pedido.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            responder({"id": id_, "erro": "Cole um link de vídeo (começando com http)."})
            continue
        try:
            responder({"id": id_, **transcrever(url, ffmpeg, pedido.get("modo") or "preciso")})
        except Exception as e:
            responder({"id": id_, "erro": f"Falhou ao transcrever: {str(e)[:240]}"})


main()
