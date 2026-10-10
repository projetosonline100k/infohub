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
OCIOSO_MAX_S = 10 * 60
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


def transcrever(url, ffmpeg, modo="preciso"):
    import yt_dlp
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
        perfil = perfil_instagram(url)
        try:
            info = None
            if perfil:
                try:
                    with yt_dlp.YoutubeDL({**opcoes, "cookiesfrombrowser": ("chrome", perfil)}) as ydl:
                        info = ydl.extract_info(url, download=True) or {}
                except Exception as e:  # sessão caiu: segue deslogado (sem views)
                    print(f"instagram logado falhou: {e}", file=sys.stderr, flush=True)
            if info is None:
                with yt_dlp.YoutubeDL(opcoes) as ydl:
                    info = ydl.extract_info(url, download=True) or {}
        except Exception as e:  # link privado, removido, pedindo login…
            msg = str(e)
            if "Sign in" in msg or "login" in msg.lower():
                return {"erro": "Esse site pediu login para liberar o vídeo. Tente outro link (reels públicos funcionam)."}
            return {"erro": f"Não consegui baixar o vídeo: {msg[:240]}"}
        arquivos = [os.path.join(pasta, f) for f in os.listdir(pasta)]
        if not arquivos:
            return {"erro": "O vídeo não tem áudio para transcrever."}
        baixou = time.time()
        modelo = MODELOS.get(modo, MODELOS["preciso"])
        resultado = mlx_whisper.transcribe(arquivos[0], path_or_hf_repo=modelo, verbose=None)
        print(f"tempo: download {baixou - inicio:.1f}s, transcrição {time.time() - baixou:.1f}s", file=sys.stderr, flush=True)

    return {
        "texto": (resultado.get("text") or "").strip(),
        "idioma": resultado.get("language"),
        "titulo": info.get("title") or (info.get("description") or "")[:80] or None,
        "autor": info.get("uploader") or info.get("channel"),
        "duracao": info.get("duration"),
        # Pras "Ideias em destaque" do cliente (views e data, quando o site informa).
        "visualizacoes": info.get("view_count") or info.get("play_count"),
        "curtidas": info.get("like_count"),
        "comentarios": info.get("comment_count"),
        "data_publicacao": _data_iso(info.get("upload_date")),
        "capa": baixar_capa(info),
        "segundos": round(time.time() - inicio, 1),
        "modo": modo,
    }


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
        url = (pedido.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            responder({"id": id_, "erro": "Cole um link de vídeo (começando com http)."})
            continue
        try:
            responder({"id": id_, **transcrever(url, ffmpeg, pedido.get("modo") or "preciso")})
        except Exception as e:
            responder({"id": id_, "erro": f"Falhou ao transcrever: {str(e)[:240]}"})


main()
