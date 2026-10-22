"""Transforma um carrossel feito numa pasta (01.png… + conteudo.json do render do Roy) num carrossel DE VERDADE
do projeto da tarefa: aparece em Precisa de você › Revisar carrossel (páginas, editar texto, aprovar → Dalila),
igual ao do Davi. 22/10 (Davi: "o Roy está me gerando texto em vez dos slides reais para eu postar").

    python3 scripts/roy/registrar.py <id da tarefa> <pasta do carrossel>

Funciona para qualquer projeto (o serviço do Roy em si é do Davi Queiroz). Imprime o id do carrossel.
"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import roy  # noqa: E402


def registrar(atividade, pasta):
    pasta = Path(pasta).expanduser()
    pngs = sorted(p for p in pasta.glob("*.png") if p.stem.isdigit())
    if not pngs:
        raise SystemExit(f"Nenhuma página (01.png, 02.png…) em {pasta}")
    conteudo = json.loads((pasta / "conteudo.json").read_text()) if (pasta / "conteudo.json").exists() else {}
    cliente = roy.db("SELECT cliente_id FROM public.atividades WHERE id = %s", (atividade,))
    if not cliente or not cliente[0][0]:
        raise SystemExit("Tarefa não encontrada (ou sem projeto).")
    cliente = str(cliente[0][0])
    ja = roy.db("SELECT id FROM public.carrosseis WHERE atividade_roy_id = %s AND tema = %s AND status <> 'cancelado' LIMIT 1",
                (atividade, (conteudo.get("theme") or pasta.name)[:200]))
    numero = (roy.db("SELECT coalesce(max(numero), 0) + 1 FROM public.carrosseis WHERE cliente_id = %s", (cliente,)) or [[1]])[0][0]
    if ja:
        id_ = str(ja[0][0])
        roy.db("UPDATE public.carrosseis SET status = 'produzindo', atualizado_em = now() WHERE id = %s", (id_,))
    else:
        # fonte_id: o código do reel de origem (único por projeto); sem link, o nome da pasta.
        import re
        codigo = re.search(r"/(?:reel|p)/([A-Za-z0-9_-]+)", conteudo.get("fonte") or "")
        fonte = codigo.group(1) if codigo else f"pasta:{pasta.name}"
        id_ = str(roy.db("""INSERT INTO public.carrosseis (cliente_id, numero, tema, fonte_id, fonte_permalink, status, mensagem, atividade_roy_id,
                                                         slides, legenda)
                            VALUES (%s, %s, %s, %s, %s, 'produzindo', 'Subindo as páginas…', %s, %s, %s)
                            ON CONFLICT (cliente_id, fonte_id) DO UPDATE SET status = 'produzindo', atividade_roy_id = EXCLUDED.atividade_roy_id,
                              slides = EXCLUDED.slides, legenda = EXCLUDED.legenda, tema = EXCLUDED.tema
                            RETURNING id""",
                         (cliente, numero, (conteudo.get("theme") or pasta.name)[:200], fonte, conteudo.get("fonte"), atividade,
                          json.dumps(conteudo.get("slides") or [], ensure_ascii=False), conteudo.get("caption")))[0][0])
    # As páginas vão para o Storage do projeto da tarefa (o caminho leva o cliente).
    antes, roy.CLIENTE = roy.CLIENTE, cliente
    try:
        urls, _ = roy.enviar_storage(id_, pngs)
    finally:
        roy.CLIENTE = antes
    # pasta_drive guarda onde estão os arquivos (para o ajuste pelo chat refazer em cima deles).
    roy.db("""UPDATE public.carrosseis SET status = 'revisar', paginas = %s, versao = CASE WHEN %s THEN coalesce(versao, 1) + 1 ELSE 1 END,
                     mensagem = NULL, pasta_drive = %s, atualizado_em = now() WHERE id = %s""", (list(urls), bool(ja), f"local:{pasta}", id_))
    return id_


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    print(registrar(sys.argv[1], sys.argv[2]))
