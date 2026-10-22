"""Sobe imagens (ou vídeo curto) de uma entrega para a nuvem e devolve os links, para pôr no documento.

    python3 scripts/empresa/imagens.py <atividade_id> <arquivo ou pasta> [mais arquivos…]

Pasta: sobe as imagens dela em ordem de nome (01.png, 02.png…). Imprime um link por linha e, no fim,
o HTML pronto (<img>) para colar na entrega. 22/10 (Davi: "sou bem visual"): carrossel, arte, capa,
página… a entrega tem que mostrar as imagens, não só descrever.
"""
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

TIPOS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4"}


def _supabase():
    env = dict(l.split("=", 1) for l in (RAIZ / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    return env["VITE_SUPABASE_URL"].strip().strip('"'), env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip().strip('"')


def _ssl():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def token_para(atividade):
    c = connect()
    try:
        q = c.cursor()
        q.execute("INSERT INTO public.entregas_envio (atividade_id) VALUES (%s) RETURNING token", (atividade,))
        t = str(q.fetchone()[0])
        c.commit()
        return t
    finally:
        c.close()


def subir(atividade, arquivos):
    url, chave = _supabase()
    token = token_para(atividade)
    links = []
    for n, arq in enumerate(arquivos, 1):
        nome = f"{n:02d}{arq.suffix.lower()}"
        caminho = f"{atividade}/{token}/{nome}"
        req = urllib.request.Request(f"{url}/storage/v1/object/entregas/{caminho}", data=arq.read_bytes(), method="POST",
                                     headers={"Authorization": f"Bearer {chave}", "apikey": chave,
                                              "Content-Type": TIPOS.get(arq.suffix.lower(), "application/octet-stream")})
        for tentativa in range(4):
            try:
                with urllib.request.urlopen(req, context=_ssl(), timeout=120):
                    pass
                break
            except urllib.error.HTTPError as e:
                if e.code < 500 or tentativa == 3:
                    raise SystemExit(f"Não subiu {arq.name}: {e.code} {e.read()[:200]!r}")
            except urllib.error.URLError:
                if tentativa == 3:
                    raise
            time.sleep(3 * (tentativa + 1))
        links.append(f"{url}/storage/v1/object/public/entregas/{caminho}")
    return links


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    atividade = sys.argv[1]
    arquivos = []
    for a in sys.argv[2:]:
        p = Path(a).expanduser()
        if p.is_dir():
            arquivos += sorted(x for x in p.iterdir() if x.suffix.lower() in TIPOS)
        elif p.suffix.lower() in TIPOS:
            arquivos.append(p)
    if not arquivos:
        sys.exit("Nenhuma imagem encontrada.")
    links = subir(atividade, arquivos)
    print("\n".join(links))
    print("\nHTML para a entrega:")
    print("\n".join(f'<p><img src="{l}" alt="Página {i}"></p>' if not l.endswith(".mp4") else f'<p><a href="{l}">Vídeo {i}</a></p>'
                    for i, l in enumerate(links, 1)))


if __name__ == "__main__":
    main()
