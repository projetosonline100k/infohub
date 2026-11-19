"""Imagens do quiz geradas pelo Roy (API de imagens da OpenAI, autorizada pelo
Davi em 14/10/2026; para o quiz, em 15/10/2026). Cena inteira, sem recorte,
no estilo dos carrosséis do Matheus: escultura de mármore, preto e vermelho.

  python3 scripts/quiz/imagens.py gerar <pasta> <<'FIM'      → gera o que ainda não existe
  [{"nome": "q1", "cena": "...", "formato": "largo" | "quadrado"}, ...]
  FIM
  python3 scripts/quiz/imagens.py subir <atividade_id> <pasta> → sobe as imagens para o
      bucket quiz-imagens e imprime {nome: url}

O envio usa a chave pública: a conexão de admin abre um token de 1 hora em
quiz_envios e o Storage só aceita em quiz-imagens/roy/<quiz>/<token>/
(migração 20261015100000_quiz_envio)."""
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
sys.path.insert(0, str(RAIZ / 'scripts' / 'roy'))
from migration_db import connect  # noqa: E402

ESTILO = ('{cena}. Classical white marble sculpture, dramatic chiaroscuro museum photography, deep black background, '
          'a single deep crimson red (#B3121B) accent light or element, cinematic, highly detailed carved marble, '
          'minimal composition with empty space, no text, no letters, no watermark, no frame.')
TAMANHOS = {'largo': '1536x1024', 'quadrado': '1024x1024'}


def gerar(pasta, itens):
    from ilustracoes import gerar as gerar_openai
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)

    def um(i):
        destino = pasta / f"{i['nome']}.png"
        if destino.exists():
            return destino
        prompt = i['prompt'] if i.get('prompt') else ESTILO.format(cena=i['cena'])
        return gerar_openai(prompt, destino, qualidade='high', tamanho=TAMANHOS[i.get('formato', 'largo')],
                            transparente=False, recortar=False)

    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(um, itens):
            print(r, flush=True)


def leve(p, largura=1080, qualidade=72):
    """Quiz abre no celular, vindo do anúncio: WebP de até 1080 px (~20-50 KB em vez de 150-500 KB)."""
    import io
    from PIL import Image
    im = Image.open(p)
    im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')   # mascote sem fundo mantém a transparência
    if im.width > largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=qualidade, method=6)
    return buf.getvalue()


def subir(aid, pasta):
    from roy import _supabase, TIPOS
    import instagram
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT id FROM quizzes WHERE atividade_id = %s ORDER BY criado_em DESC LIMIT 1", (aid,))
        qid = q.fetchone()[0]
        q.execute("INSERT INTO quiz_envios (quiz_id) VALUES (%s) RETURNING token", (qid,))
        token = q.fetchone()[0]
        c.commit()
    finally:
        c.close()
    url, chave = _supabase()
    urls = {}
    for p in sorted(Path(pasta).iterdir()):
        if p.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or p.name.endswith('.bruto.png'):
            continue
        caminho = f"roy/{qid}/{token}/{p.stem}.webp"
        req = urllib.request.Request(f"{url}/storage/v1/object/quiz-imagens/{caminho}", data=leve(p), method='POST',
                                     headers={'Authorization': f'Bearer {chave}', 'apikey': chave,
                                              'Content-Type': TIPOS['.webp'], 'x-upsert': 'false'})
        with urllib.request.urlopen(req, context=instagram._ssl(), timeout=120):
            pass
        urls[p.stem] = f"{url}/storage/v1/object/public/quiz-imagens/{caminho}"
    print(json.dumps(urls, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == 'gerar':
        gerar(a[1], json.loads(sys.stdin.read()))
    elif len(a) == 3 and a[0] == 'subir':
        subir(a[1], a[2])
    else:
        raise SystemExit(__doc__)
