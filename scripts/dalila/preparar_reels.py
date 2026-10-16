"""Dalila no Mac: prepara os reels aprovados para a nuvem publicar.

Edição aprovada (Danilo) → linha em `reels` com status 'preparando'
(migração 20261016050000_dalila_reels). Para cada uma, este script:
  1. comprime o final do Drive para caber no Storage (plano gratuito do
     Supabase: 50 MB por arquivo) — HEVC pela VideoToolbox, 1080x1920, 30 fps,
     AAC 128k, moov no início (o que a Meta pede para Reels);
  2. sobe no bucket público `reels` com o token do reel (no Mac não há chave
     de servidor; a policy só aceita com o token, enquanto prepara);
  3. sugere a legenda com o Claude em segundo plano (mesmo login do ouvinte),
     a partir da fala do vídeo e de legendas reais do perfil;
  4. marca 'pronto' → nasce a tarefa "Escolher data do reel" do Davi.
Quem escolhe a data é o Davi; a publicação é da edge dalila-publicar.

  python3 preparar_reels.py            # uma passada
  python3 preparar_reels.py --sempre   # serviço (LaunchAgent com.infoprohub.dalila)
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.request
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(Path.home() / ".infopro-hub" / "py"))
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

FF = Path.home() / ".infopro-hub" / "creator-bin" / "ffmpeg"
TRABALHO = Path.home() / ".infopro-hub" / "dalila" / "reels"
TRANSCRICOES = Path.home() / ".infopro-hub" / "danilo" / "edicoes"
LOG = Path.home() / ".infopro-hub" / "dalila" / "servico.log"
LIMITE_BYTES = 49 * 1024 * 1024      # o bucket aceita até 50 MB
ALVO_MB = 46
MAX_TENTATIVAS = 5

PROMPT_LEGENDA = """Você é a Dalila, social media do perfil do especialista "{especialista}" no Instagram.
Escreva a LEGENDA do reel abaixo, em português do Brasil, no tom do perfil.

Título do vídeo: {titulo}
O que é falado no vídeo (transcrição):
\"\"\"{fala}\"\"\"

Legendas reais do perfil, para copiar o tom e o formato (não repita o conteúdo):
{exemplos}

Regras:
- Primeira linha forte, que faça a pessoa abrir a legenda (pode retomar a promessa do vídeo).
- Depois, 2 a 5 linhas curtas reforçando a ideia principal, sem inventar nada que o vídeo não diz.
- Termine com uma chamada para ação simples (salvar, mandar para alguém, comentar uma palavra).
- Siga o padrão das legendas reais quanto a emojis e hashtags; na dúvida, no máximo 3 hashtags.
- Até 1.200 caracteres.
Responda SOMENTE com a legenda entre <legenda> e </legenda>, sem mais nada."""


def log(*partes):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    linha = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] " + " ".join(str(p) for p in partes)
    print(linha, flush=True)
    with LOG.open("a") as f:
        f.write(linha + "\n")


def db(sql, args=()):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        linhas = q.fetchall() if q.description else []
        c.commit()
        return linhas
    finally:
        c.close()


def chaves_publicas():
    env = dict(l.split("=", 1) for l in (RAIZ / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    url = env.get("VITE_SUPABASE_URL", "").strip().strip('"')
    chave = env.get("VITE_SUPABASE_PUBLISHABLE_KEY", "").strip().strip('"')
    if not url or not chave:
        raise RuntimeError("falta VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY no .env")
    return url, chave


def duracao(arquivo):
    r = subprocess.run([str(FF), "-hide_banner", "-i", str(arquivo)], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    if not m:
        raise RuntimeError("não consegui ler a duração do vídeo final")
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


def comprimir(origem, destino, segundos):
    kbps = min(6000, int(ALVO_MB * 8 * 1024 / segundos) - 128)
    for _ in range(3):
        if kbps < 900:
            raise RuntimeError(f"vídeo de {segundos:.0f}s é longo demais para caber em 50 MB com qualidade")
        cmd = [str(FF), "-hide_banner", "-loglevel", "error", "-y", "-i", str(origem),
               "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
               "-c:v", "hevc_videotoolbox", "-b:v", f"{kbps}k", "-maxrate", f"{kbps * 13 // 10}k", "-bufsize", f"{kbps * 2}k",
               "-tag:v", "hvc1", "-profile:v", "main", "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
               "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", str(destino)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg falhou: {r.stderr.strip()[-300:]}")
        if destino.stat().st_size <= LIMITE_BYTES:
            return destino.stat().st_size
        kbps = kbps * 85 // 100
    raise RuntimeError("o vídeo comprimido continuou maior que 50 MB")


def enviar(url, chave, caminho, arquivo):
    req = urllib.request.Request(f"{url}/storage/v1/object/reels/{caminho}", data=arquivo.read_bytes(), method="POST",
                                 headers={"apikey": chave, "Authorization": f"Bearer {chave}",
                                          "Content-Type": "video/mp4", "x-upsert": "false"})
    import certifi, ssl  # noqa: E401
    ctx = ssl.create_default_context(cafile=certifi.where())
    try:
        urllib.request.urlopen(req, context=ctx, timeout=600).read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Storage recusou o vídeo (HTTP {e.code}): {e.read().decode()[:200]}")
    return f"{url}/storage/v1/object/public/reels/{caminho}"


def fala_do_video(edicao_id):
    arq = TRANSCRICOES / edicao_id / "transcricao.json"
    if arq.exists():
        try:
            return (json.loads(arq.read_text()).get("text") or "").strip()
        except ValueError:
            pass
    return ""


def sugerir_legenda(reel):
    especialista = (db("SELECT nome_especialista FROM public.clientes WHERE id = %s", (reel["cliente_id"],)) or [[""]])[0][0]
    exemplos = [l for (l,) in db("""SELECT fonte_legenda FROM public.carrosseis WHERE cliente_id = %s
        AND coalesce(fonte_legenda, '') <> '' ORDER BY fonte_data DESC NULLS LAST LIMIT 5""", (reel["cliente_id"],))]
    exemplos += [l for (l,) in db("""SELECT legenda FROM public.reels WHERE cliente_id = %s AND status = 'publicado'
        ORDER BY publicado_em DESC LIMIT 3""", (reel["cliente_id"],))]
    fala = fala_do_video(reel["edicao_id"]) or "(sem transcrição: use só o título)"
    prompt = PROMPT_LEGENDA.format(especialista=especialista, titulo=reel["titulo"], fala=fala[:6000],
                                   exemplos="\n---\n".join(e[:800] for e in exemplos) or "(o perfil ainda não tem exemplos)")
    spec = importlib.util.spec_from_file_location("jarvis_ouvinte", RAIZ / "scripts" / "jarvis-ouvinte.py")
    ouvinte = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ouvinte)
    ok, texto = ouvinte.rodar_claude(prompt, minutos=8, turnos=3)
    m = re.search(r"<legenda>(.*?)</legenda>", texto or "", re.S)
    if not ok or not m or not m[1].strip():
        raise RuntimeError(f"o Claude não devolveu a legenda: {(texto or '')[:200]}")
    return m[1].strip()[:2200]


def preparar(reel):
    rid = reel["id"]
    final = Path(reel["final_drive"] or "")
    if not final.is_file():
        db("UPDATE public.reels SET mensagem = 'Esperando o vídeo final aparecer no Drive deste Mac' WHERE id = %s", (rid,))
        return False
    pasta = TRABALHO / rid
    pasta.mkdir(parents=True, exist_ok=True)
    tentativa = reel["preparo_tentativas"] + 1
    db("UPDATE public.reels SET preparo_tentativas = %s, mensagem = 'Dalila preparando o vídeo e a legenda' WHERE id = %s", (tentativa, rid))
    segundos = duracao(final)
    saida = pasta / "reel.mp4"
    tamanho = comprimir(final, saida, segundos)
    log(rid, f"comprimido: {tamanho / 1048576:.1f} MB, {segundos:.0f}s")
    url, chave = chaves_publicas()
    caminho = f"{reel['cliente_id']}/{rid}/{reel['token_envio']}/reel-v{tentativa}.mp4"
    publico = enviar(url, chave, caminho, saida)
    legenda = reel["legenda"] or sugerir_legenda(reel)
    db("""UPDATE public.reels SET video_url = %s, video_caminho = %s, video_bytes = %s, duracao = %s, legenda = %s,
          status = 'pronto', mensagem = 'Vídeo e legenda prontos: falta o Davi escolher a data', atualizado_em = now()
          WHERE id = %s AND status = 'preparando'""", (publico, caminho, tamanho, round(segundos, 1), legenda, rid))
    log(rid, "pronto:", reel["titulo"])
    return True


def passada():
    colunas = ["id", "cliente_id", "edicao_id", "titulo", "final_drive", "token_envio", "legenda", "preparo_tentativas"]
    linhas = db(f"""SELECT {', '.join(colunas)} FROM public.reels
        WHERE status = 'preparando' AND preparo_tentativas < %s ORDER BY criado_em""", (MAX_TENTATIVAS,))
    for linha in linhas:
        reel = {k: (str(v) if k in ("id", "cliente_id", "edicao_id", "token_envio") else v) for k, v in zip(colunas, linha)}
        try:
            preparar(reel)
        except Exception as e:  # noqa: BLE001
            log(reel["id"], "erro:", e)
            traceback.print_exc()
            fim = reel["preparo_tentativas"] + 1 >= MAX_TENTATIVAS
            db("UPDATE public.reels SET mensagem = %s, status = CASE WHEN %s THEN 'erro' ELSE status END WHERE id = %s",
               (f"Não consegui preparar: {e}"[:500], fim, reel["id"]))


if __name__ == "__main__":
    if "--sempre" in sys.argv:
        log("serviço da Dalila (reels) ligado")
        while True:
            try:
                passada()
            except Exception as e:  # noqa: BLE001
                log("passada falhou:", e)
            time.sleep(60)
    else:
        passada()
