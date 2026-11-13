"""Roteiros dos vídeos dark do Lauro (13/11/2026, Davi: "eu subo o roteiro, o Lauro faz o resto; calendário com o status embaixo").
O Davi sobe o roteiro no app (aba Roteiros do dash do Lauro); o Lauro lê o roteiro aqui, produz o vídeo e atualiza o status, que aparece no calendário.

  python3 scripts/lauro/roteiros.py listar [<perfil>]                      os roteiros (V1, V2…) com dia e status
  python3 scripts/lauro/roteiros.py contexto <id>                          o roteiro inteiro, o perfil e o ESTILO do vídeo cadastrado
  python3 scripts/lauro/roteiros.py status <id> <novo> [--obs "..."] [--arquivo <caminho>]
        novo = editando (começou a produzir) | programando (vídeo pronto, agendando a publicação) | programado (agendado) | erro (travou: diga o porquê em --obs)
        --arquivo: caminho do vídeo final (em ~/.infopro-hub/exemplos/<perfil>/roteiros/<id>/), que o Davi vê no calendário
  python3 scripts/lauro/roteiros.py data <id> AAAA-MM-DD                    muda o dia de postagem

<id> pode ser o começo do id (8 caracteres bastam).
"""
import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

STATUS = ("editando", "programando", "programado", "erro")


def _achar(q, prefixo):
    q.execute("SELECT r.id, r.perfil_id, r.numero, r.titulo, r.texto, r.data_postagem, r.status, r.arquivo, r.obs, p.nome, p.arroba, p.estilo FROM public.esteira_dark_roteiros r "
              "JOIN public.esteira_dark_perfis p ON p.id = r.perfil_id WHERE r.id::text LIKE %s ORDER BY r.criado_em DESC LIMIT 2", (prefixo.lower() + "%",))
    linhas = q.fetchall()
    if not linhas:
        sys.exit("Roteiro não encontrado.")
    if len(linhas) > 1:
        sys.exit("Mais de um roteiro com esse começo de id: use mais caracteres.")
    return linhas[0]


def main():
    p = argparse.ArgumentParser(description="Roteiros dos vídeos dark")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("listar"); a.add_argument("perfil", nargs="?")
    b = sub.add_parser("contexto"); b.add_argument("id")
    c_ = sub.add_parser("status"); c_.add_argument("id"); c_.add_argument("novo", choices=STATUS); c_.add_argument("--obs"); c_.add_argument("--arquivo")
    d = sub.add_parser("data"); d.add_argument("id"); d.add_argument("dia")
    arg = p.parse_args()
    c = connect()
    try:
        q = c.cursor()
        if arg.cmd == "listar":
            q.execute("SELECT left(r.id::text, 8), p.nome, r.numero, r.titulo, r.data_postagem, r.status FROM public.esteira_dark_roteiros r JOIN public.esteira_dark_perfis p ON p.id = r.perfil_id "
                      "WHERE %s::text IS NULL OR p.nome ILIKE %s ORDER BY p.nome, r.numero", (arg.perfil, f"%{arg.perfil}%" if arg.perfil else None))
            for i, nome, n, t, dia, st in q.fetchall():
                print(f"{i}  {nome} · V{n}  {dia or 'sem dia'}  {st:<11} {t}")
        elif arg.cmd == "contexto":
            r = _achar(q, arg.id)
            print(f"Roteiro V{r[2]} · {r[3]}  (id {str(r[0])[:8]})\nPerfil: {r[9]} {r[10] or ''}\nDia de postagem: {r[5] or 'sem dia'}\nStatus: {r[6]}" + (f"\nArquivo: {r[7]}" if r[7] else "") + (f"\nObs: {r[8]}" if r[8] else ""))
            print("\nESTILO DO VÍDEO DO PERFIL (siga):\n" + json.dumps(r[11], ensure_ascii=False, indent=1))
            print("\nROTEIRO:\n" + r[4])
        elif arg.cmd == "status":
            r = _achar(q, arg.id)
            q.execute("UPDATE public.esteira_dark_roteiros SET status = %s, obs = coalesce(%s, obs), arquivo = coalesce(%s, arquivo), atualizado_em = now() WHERE id = %s", (arg.novo, arg.obs, arg.arquivo, r[0]))
            c.commit()
            print(f"V{r[2]} ({r[9]}): {arg.novo}")
        elif arg.cmd == "data":
            r = _achar(q, arg.id)
            q.execute("UPDATE public.esteira_dark_roteiros SET data_postagem = %s, atualizado_em = now() WHERE id = %s", (arg.dia, r[0]))
            c.commit()
            print(f"V{r[2]} ({r[9]}): dia {arg.dia}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
