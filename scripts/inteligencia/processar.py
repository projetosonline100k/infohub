"""Transcreve no Mac os vídeos/áudios/links da inteligência que estão na fila.

  python3 scripts/inteligencia/processar.py          → processa a fila e sai
  python3 scripts/inteligencia/processar.py --listar → só mostra a fila

Baixa pelo link (o app guarda um link assinado de 7 dias para arquivos
enviados; YouTube vai pelo yt-dlp), extrai o áudio com o ffmpeg do Danilo e transcreve com o
mlx-whisper (pt). Devolve pela RPC com o token do item."""
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from comum import _ssl, concluir, consultar

FF = os.path.expanduser('~/.infopro-hub/creator-bin/ffmpeg')
# yt-dlp para links do YouTube: pip3 install --target ~/.infopro-hub/ytdlp yt-dlp
YTDLP = os.path.expanduser('~/.infopro-hub/ytdlp')
CERTS = os.path.expanduser('~/.infopro-hub/py/certifi/cacert.pem')
MODELO = 'mlx-community/whisper-large-v3-turbo'


def fila():
    return consultar("""
        select i.id, i.nome, i.tipo, i.link, t.token
          from inteligencia_membros i join inteligencia_tokens t on t.item_id = i.id
         where i.status in ('pendente', 'processando') and i.tipo in ('video', 'link')
         order by i.created_at""")


def eh_youtube(link):
    return any(d in link for d in ('youtube.com/', 'youtu.be/'))


def baixar_youtube(link, destino):
    if not os.path.isdir(YTDLP):
        raise RuntimeError('yt-dlp não instalado neste Mac (ver scripts/inteligencia/processar.py)')
    env = {**os.environ, 'PYTHONPATH': YTDLP, 'SSL_CERT_FILE': CERTS}
    r = subprocess.run([sys.executable, '-m', 'yt_dlp', '-f', 'bestaudio/best', '--no-playlist', '-q',
                        '--ffmpeg-location', FF, '-o', str(destino), link], env=env, capture_output=True, text=True)
    if r.returncode != 0 or not Path(destino).exists():
        raise RuntimeError('não consegui baixar do YouTube: ' + (r.stderr.strip().splitlines() or ['?'])[-1][:150])


def baixar(link, destino):
    if eh_youtube(link):
        return baixar_youtube(link, destino)
    req = urllib.request.Request(link, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120, context=_ssl()) as r:
        tipo = r.headers.get('Content-Type', '')
        if 'text/html' in tipo:
            raise RuntimeError('o link abre uma página, não um arquivo (YouTube/Drive: baixe e suba o arquivo)')
        with open(destino, 'wb') as f:
            while bloco := r.read(1 << 20):
                f.write(bloco)


def transcrever(arquivo, pasta):
    wav = Path(pasta) / 'audio.wav'
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(arquivo),
                    '-vn', '-ac', '1', '-ar', '16000', str(wav)], check=True)
    sys.path.insert(0, os.path.expanduser('~/.infopro-hub/creator'))
    os.environ['PATH'] = os.path.expanduser('~/.infopro-hub/creator-bin') + os.pathsep + os.environ['PATH']
    import mlx_whisper
    r = mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODELO, language='pt', verbose=None)
    return r.get('text', '').strip()


def main():
    itens = fila()
    if '--listar' in sys.argv or not itens:
        for i in itens:
            print(f"{i['tipo']} · {i['nome']}")
        print(f'{len(itens)} na fila.')
        return
    for i in itens:
        print(f"→ {i['nome']}", flush=True)
        concluir(i['id'], i['token'], 'processando')
        try:
            if not i['link']:
                raise RuntimeError('sem link para baixar')
            with tempfile.TemporaryDirectory() as pasta:
                arquivo = Path(pasta) / 'entrada'
                baixar(i['link'], arquivo)
                texto = transcrever(arquivo, pasta)
            if not texto:
                raise RuntimeError('não ouvi fala nenhuma')
            concluir(i['id'], i['token'], 'pronto', texto)
            print(f'  pronto: {len(texto):,} caracteres'.replace(',', '.'))
        except Exception as e:  # noqa: BLE001 — devolve o motivo para a tela
            msg = str(e)
            if 'HTTP Error 400' in msg or 'HTTP Error 403' in msg:
                msg = 'o link expirou: suba o arquivo de novo'
            concluir(i['id'], i['token'], 'erro', None, f'Não transcreveu: {msg}'[:300])
            print(f'  erro: {msg}')


if __name__ == '__main__':
    main()
