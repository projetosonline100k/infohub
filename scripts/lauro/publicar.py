"""Lauro no Mac: prepara o vídeo aprovado para a nuvem publicar no Instagram do perfil dark.

Davi aprova o vídeo no estúdio do roteiro → status 'programando' com `arquivo` = o vídeo aprovado
(migração 20261113160000_esteira_dark_instagram). Para cada um sem `video_url`, este script:
  1. comprime o vídeo para caber no Storage (50 MB), mesmo método da Dalila (preparar_reels.comprimir);
  2. sobe no bucket público `reels` com o token do roteiro (<perfil>/<roteiro>/<token>/reel-vN.mp4);
  3. grava `video_url` e uma legenda sugerida (o título do roteiro, se ainda não houver).
Aprovar = o ok: o vídeo é programado sozinho para as 18h (lauro_programar_auto: dia marcado ou o 1º dia livre; legenda = título); a edge `lauro-publicar` (pg_cron) publica.
Nada é programado sem o Aprovar do Davi; ele ainda pode desmarcar/mudar no estúdio.

  python3 scripts/lauro/publicar.py            # uma passada
  python3 scripts/lauro/publicar.py --sempre   # laço de 60 s
"""
import sys
import time
import traceback
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(Path.home() / ".infopro-hub" / "py"))
sys.path.insert(0, str(RAIZ / "scripts"))
from dalila import preparar_reels as pr  # noqa: E402

TRABALHO = Path.home() / ".infopro-hub" / "lauro" / "publicar"
MAX_TENTATIVAS = 4
_falhas = {}


def log(*a):
    print(time.strftime("%H:%M:%S"), "lauro-publicar:", *a, flush=True)


def preparar(r):
    rid, perfil, token, arquivo, titulo, legenda = r
    origem = Path(arquivo or "")
    if not origem.is_file():
        pr.db("UPDATE public.esteira_dark_roteiros SET mensagem = %s WHERE id = %s", ("Não achei o arquivo do vídeo aprovado neste Mac", rid))
        return
    pasta = TRABALHO / rid
    pasta.mkdir(parents=True, exist_ok=True)
    pr.db("UPDATE public.esteira_dark_roteiros SET mensagem = 'Preparando o vídeo para o Instagram' WHERE id = %s", (rid,))
    segundos = pr.duracao(origem)
    saida = pasta / "reel.mp4"
    tamanho = pr.comprimir(origem, saida, segundos)
    url, chave = pr.chaves_publicas()
    caminho = f"{perfil}/{rid}/{token}/reel-v{int(time.time())}.mp4"
    publico = pr.enviar(url, chave, caminho, saida)
    pr.db("""UPDATE public.esteira_dark_roteiros SET video_url = %s, video_caminho = %s, legenda = coalesce(legenda, %s),
             mensagem = 'Vídeo pronto: escolha a data para programar', atualizado_em = now()
             WHERE id = %s AND status = 'programando' AND video_url IS NULL""", (publico, caminho, titulo, rid))
    log("pronto:", rid, f"{tamanho / 1048576:.1f} MB")
    _programar_sozinho(rid)


def _programar_sozinho(rid):
    """Aprovou = ok (13/11, Davi: "pode já programar para as 18 horas padrão"): o vídeo aprovado e pronto vai para o 1º horário livre das 18h (ou o dia marcado). Sem Instagram conectado, espera."""
    r = pr.db("SELECT public.lauro_programar_auto(%s::uuid)", (rid,))
    if r and r[0][0]:
        log("programado sozinho:", rid, r[0][0])


def passada():
    linhas = pr.db("""SELECT id::text, perfil_id::text, token_envio::text, arquivo, titulo, legenda FROM public.esteira_dark_roteiros
                      WHERE status = 'programando' AND video_url IS NULL AND arquivo IS NOT NULL ORDER BY atualizado_em""")
    for r in linhas:
        if _falhas.get(r[0], 0) >= MAX_TENTATIVAS:
            continue
        try:
            preparar(r)
        except Exception as e:  # noqa: BLE001
            _falhas[r[0]] = _falhas.get(r[0], 0) + 1
            log(r[0], "erro:", e)
            traceback.print_exc()
            pr.db("UPDATE public.esteira_dark_roteiros SET mensagem = %s WHERE id = %s", (f"Não consegui preparar o vídeo: {e}"[:400], r[0]))
    # vídeo já pronto que ficou esperando (ex.: o Instagram foi conectado depois): programa agora
    for (rid,) in pr.db("SELECT id::text FROM public.esteira_dark_roteiros WHERE status = 'programando' AND video_url IS NOT NULL"):
        _programar_sozinho(rid)


if __name__ == "__main__":
    if "--sempre" in sys.argv:
        while True:
            try:
                passada()
            except Exception as e:  # noqa: BLE001
                log("passada falhou:", e)
            time.sleep(60)
    else:
        passada()
