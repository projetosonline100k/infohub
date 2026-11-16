"""Dalila: escolhe a capa do reel (pedido do Davi, 27/10/2026).

Sem capa, o Instagram usa o 1º quadro, que nos vídeos do Danilo tem a lousa
ainda vazia em cima (a "parte preta" no feed). Aqui a Dalila olha um quadro
por segundo e escolhe o mais bonito: lousa cheia (mais traço na metade de
cima), imagem nítida e sem faixa escura vazia. O resultado vai em
`reels.capa_ms` (a edge dalila-publicar manda como `thumb_offset`) e as
outras boas opções em `reels.capa_sugestoes` (o Davi troca em Programados).

  python3 capa.py arquivo.mp4                 # mostra as escolhas
  python3 capa.py --programados               # dá capa aos reels prontos/programados sem capa
  python3 capa.py --programados --refazer     # refaz a escolha da Dalila (não mexe na do Davi)
"""
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

FF = Path.home() / ".infopro-hub" / "creator-bin" / "ffmpeg"
L, A = 90, 160            # quadro reduzido (9:16) para medir
SUGESTOES = 8
DISTANCIA_MS = 6000       # sugestões espaçadas, para não serem o mesmo momento


def _medidas(px, y0, y1):
    """Traço (fração de pixels com borda forte), nitidez e fração de linhas vazias e escuras na faixa."""
    bordas = nitidez = 0
    vazias = 0
    for y in range(y0, y1 - 1):
        linha = px[y * L:(y + 1) * L]
        abaixo = px[(y + 1) * L:(y + 2) * L]
        forte = 0
        for x in range(L - 1):
            g = abs(linha[x + 1] - linha[x]) + abs(abaixo[x] - linha[x])
            nitidez += g * g
            if g > 40:
                forte += 1
        bordas += forte
        if forte <= 1 and max(linha) < 60:
            vazias += 1
    n = (y1 - y0 - 1) * (L - 1)
    return bordas / n, nitidez / n, vazias / (y1 - y0 - 1)


def pontuar(px):
    meio = A // 2
    traco_cima, nit_cima, vazio_cima = _medidas(px, 0, meio)
    traco_baixo, nit_baixo, _ = _medidas(px, meio, A)
    return traco_cima, nit_cima + nit_baixo, traco_baixo, vazio_cima


def _papel_e_tinta(px):
    """Metade de cima é a folha de papel com desenhos (tela dividida)? E quanto dela já está desenhado (traços escuros ou vermelhos)?
    Folha = fundo claro e quase uniforme; tinta = fração de pixels bem mais escuros que a folha. Quadro cheio com o Davi não é folha (tinta = 0)."""
    topo = sorted(px[:(A // 2) * L])
    mediana = topo[len(topo) // 2]
    if mediana < 150:
        return False, 0.0
    perto = sum(1 for v in topo if abs(v - mediana) <= 30) / len(topo)
    if perto < 0.72:       # folha rasgando (transição com o Davi aparecendo por baixo) ou outra cena: não é folha limpa
        return False, 0.0
    escuro = sum(1 for v in topo if v < 90) / len(topo)
    if escuro > 0.045:     # mancha escura (o rasgo da transição mostrando o Davi) não é traço de desenho
        return False, 0.0
    base = sorted(px[(A // 2) * L:])
    if base[len(base) // 2] > 150:   # embaixo tem que ter o Davi (cena escura): folha cheia sem ele é a tela final
        return False, 0.0
    tinta = sum(1 for v in topo if v < mediana - 45) / len(topo)
    return True, tinta


def _quadro_valido(video, ms):
    r = subprocess.run([str(FF), "-hide_banner", "-loglevel", "error", "-ss", f"{ms / 1000:.3f}", "-i", str(video), "-frames:v", "1",
                        "-vf", f"scale={L}:{A},format=gray", "-f", "rawvideo", "-"], capture_output=True)
    if r.returncode != 0 or len(r.stdout) < L * A:
        return False
    e_papel, tinta = _papel_e_tinta(r.stdout[:L * A])
    return e_papel and tinta >= 0.01


def escolher(video, segundos=None):
    """Lista de instantes (ms), o melhor primeiro."""
    r = subprocess.run([str(FF), "-hide_banner", "-loglevel", "error", "-i", str(video),
                        "-vf", f"fps=1,scale={L}:{A},format=gray", "-f", "rawvideo", "-"], capture_output=True)
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError(f"ffmpeg não leu os quadros: {r.stderr.decode()[-200:]}")
    tam = L * A
    quadros = [r.stdout[i:i + tam] for i in range(0, len(r.stdout) - tam + 1, tam)]
    total = segundos or len(quadros)
    # Fora o 1º segundo (lousa vazia) e os 2 últimos (encerramento).
    medidos = [(i, pontuar(q)) for i, q in enumerate(quadros) if 1 <= i <= max(1, total - 2)]
    if not medidos:
        return [0]
    maior = [max(m[k] for _, m in medidos) or 1 for k in range(3)]
    # 16/11 (Davi: "nenhuma das capas mostra os desenhos em cima"): nos vídeos de tela dividida a capa precisa ter a folha JÁ desenhada.
    # Se o vídeo tem folha, só ela concorre, e ganha o quadro com mais tinta (e rosto nítido embaixo).
    folha = {i: _papel_e_tinta(quadros[i]) for i, _ in medidos}
    com_folha = [i for i, (e_papel, t) in folha.items() if e_papel and t >= 0.01]
    notas = []
    if len(com_folha) >= 3:
        tinta_max = max(folha[i][1] for i in com_folha) or 1
        por_i = dict(medidos)
        for i in com_folha:
            nota = 0.75 * folha[i][1] / tinta_max + 0.25 * por_i[i][2] / maior[2]
            notas.append((nota, i * 1000 + 500))
    else:
        for i, (traco, nit, baixo, vazio) in medidos:
            nota = 0.55 * traco / maior[0] + 0.25 * nit / maior[1] + 0.20 * baixo / maior[2] - 0.6 * vazio
            notas.append((nota, i * 1000 + 500))   # meio do segundo: longe do corte
    notas.sort(reverse=True)
    escolhidos = []
    modo_folha = len(com_folha) >= 3
    for _, ms in notas:
        if all(abs(ms - e) >= DISTANCIA_MS for e in escolhidos):
            # O quadro medido é o do segundo cheio; a capa vai para o meio dele. Confere o quadro EXATO do instante escolhido (o rasgo da transição dura meio segundo).
            if modo_folha and not _quadro_valido(video, ms):
                continue
            escolhidos.append(ms)
        if len(escolhidos) == SUGESTOES:
            break
    return escolhidos


def _db(sql, args=()):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from migration_db import connect
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        linhas = q.fetchall() if q.description else []
        c.commit()
        return linhas
    finally:
        c.close()


def programados(refazer=False):
    """Reels ainda não publicados que já têm vídeo na nuvem (ex.: o dark de 31/10)."""
    filtro = "NOT capa_pelo_davi" if refazer else "capa_ms IS NULL"
    for rid, titulo, url, dur in _db(f"""SELECT id, titulo, video_url, duracao FROM public.reels
            WHERE status IN ('pronto', 'programado') AND ig_media_id IS NULL AND video_url IS NOT NULL AND {filtro}
            ORDER BY programado_para NULLS LAST"""):
        with tempfile.TemporaryDirectory() as pasta:
            arq = Path(pasta) / "reel.mp4"
            import certifi, ssl  # noqa: E401
            ctx = ssl.create_default_context(cafile=certifi.where())
            with urllib.request.urlopen(url, context=ctx, timeout=600) as resp:
                arq.write_bytes(resp.read())
            ms = escolher(arq, int(float(dur)) if dur else None)
        _db("""UPDATE public.reels SET capa_ms = %s, capa_sugestoes = %s, ig_container_id = NULL, ig_container_em = NULL
               WHERE id = %s AND status IN ('pronto', 'programado') AND NOT capa_pelo_davi""", (ms[0], ms, str(rid)))
        print(f"{titulo}: capa em {ms[0] / 1000:.1f}s (opções: {', '.join(f'{m / 1000:.0f}s' for m in ms[1:])})")


if __name__ == "__main__":
    if "--programados" in sys.argv:
        programados("--refazer" in sys.argv)
    elif len(sys.argv) > 1:
        print(escolher(sys.argv[1]))
    else:
        print(__doc__)
