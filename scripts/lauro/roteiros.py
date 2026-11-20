"""Roteiros dos vídeos dark do Lauro (13/11/2026, Davi: "eu subo o roteiro, o Lauro faz o resto; calendário com o status embaixo").
O Davi sobe o roteiro no app (aba Roteiros do dash do Lauro); o Lauro lê o roteiro aqui, produz o vídeo e atualiza o status, que aparece no calendário.

  python3 scripts/lauro/roteiros.py listar [<perfil>]                      os roteiros (V1, V2…) com dia e status
  python3 scripts/lauro/roteiros.py contexto <id>                          o roteiro inteiro, o perfil e o ESTILO do vídeo cadastrado
  python3 scripts/lauro/roteiros.py status <id> <novo> [--obs "..."] [--arquivo <caminho>]
        novo = editando (começou a produzir) | revisar (vídeo pronto: o Davi vê no estúdio e aprova; use --arquivo) | erro (travou: diga o porquê em --obs)
        --arquivo: caminho do vídeo (cada versão num arquivo novo: video_v1.mp4, video_v2.mp4…); fica no histórico de versões do estúdio do Davi
  python3 scripts/lauro/roteiros.py progresso <id> <0-100> "<etapa>"      a barra de andamento que o Davi vê no calendário e no estúdio (ex.: 40 "Gerando imagens (2 de 5)")
  python3 scripts/lauro/roteiros.py data <id> AAAA-MM-DD                    muda o dia de postagem
  python3 scripts/lauro/roteiros.py programar <id> AAAA-MM-DDTHH:MM [--legenda "..."]   programa a PUBLICAÇÃO no Instagram (horário de Brasília). Só depois do ok do Davi no chat!
  python3 scripts/lauro/roteiros.py desprogramar <id>                       desmarca a publicação (volta para "aprovado"; só antes de publicar)

<id> pode ser o começo do id (8 caracteres bastam).
"""
import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect  # noqa: E402

STATUS = ("editando", "revisar", "erro")   # programando/programado/publicado: do Hub (Aprovar → Mac prepara → Davi escolhe a data → nuvem publica)


def _achar(q, prefixo):
    q.execute("SELECT r.id, r.perfil_id, r.numero, r.titulo, r.texto, r.data_postagem, r.status, r.arquivo, r.obs, p.nome, p.arroba, p.estilo FROM public.esteira_dark_roteiros r "
              "JOIN public.esteira_dark_perfis p ON p.id = r.perfil_id WHERE r.id::text LIKE %s ORDER BY r.criado_em DESC LIMIT 2", (prefixo.lower() + "%",))
    linhas = q.fetchall()
    if not linhas:
        sys.exit("Roteiro não encontrado.")
    if len(linhas) > 1:
        sys.exit("Mais de um roteiro com esse começo de id: use mais caracteres.")
    return linhas[0]


def _progresso(q, rid, pct, etapa):
    """Barra de andamento (20/11). Num savepoint: se a coluna ainda não existir no banco, o status continua funcionando."""
    q.execute("SAVEPOINT progresso")
    try:
        q.execute("UPDATE public.esteira_dark_roteiros SET progresso = %s, etapa = %s, progresso_em = now() WHERE id = %s", (max(0, min(100, pct)), etapa, rid))
        q.execute("RELEASE SAVEPOINT progresso")
        return True
    except Exception:  # noqa: BLE001
        q.execute("ROLLBACK TO SAVEPOINT progresso")
        return False


AUTO_PROGRESSO = {"editando": (5, "Lendo o roteiro e o estilo"), "revisar": (100, "Vídeo pronto para revisar")}


def main():
    p = argparse.ArgumentParser(description="Roteiros dos vídeos dark")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("listar"); a.add_argument("perfil", nargs="?")
    b = sub.add_parser("contexto"); b.add_argument("id")
    c_ = sub.add_parser("status"); c_.add_argument("id"); c_.add_argument("novo", choices=STATUS); c_.add_argument("--obs"); c_.add_argument("--arquivo")
    g = sub.add_parser("progresso"); g.add_argument("id"); g.add_argument("pct", type=int); g.add_argument("etapa")
    d = sub.add_parser("data"); d.add_argument("id"); d.add_argument("dia")
    e = sub.add_parser("programar"); e.add_argument("id"); e.add_argument("quando"); e.add_argument("--legenda")
    f = sub.add_parser("desprogramar"); f.add_argument("id")
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
            if arg.arquivo:   # histórico de versões (v1, v2…): a mesma versão não entra duas vezes
                q.execute("""UPDATE public.esteira_dark_roteiros SET versoes = versoes || jsonb_build_array(jsonb_build_object('arquivo', %s::text, 'em', now()::text, 'nota', %s::text))
                              WHERE id = %s AND NOT versoes @> jsonb_build_array(jsonb_build_object('arquivo', %s::text))""", (arg.arquivo, arg.obs or "", r[0], arg.arquivo))
            if arg.novo in AUTO_PROGRESSO:
                _progresso(q, r[0], *AUTO_PROGRESSO[arg.novo])
            c.commit()
            print(f"V{r[2]} ({r[9]}): {arg.novo}")
        elif arg.cmd == "progresso":
            r = _achar(q, arg.id)
            ok = _progresso(q, r[0], arg.pct, arg.etapa.strip()[:120])
            c.commit()
            print(f"V{r[2]} ({r[9]}): {arg.pct}% {arg.etapa}" if ok else "Barra de andamento ainda não existe no banco (siga o trabalho normalmente).")
        elif arg.cmd == "data":
            r = _achar(q, arg.id)
            q.execute("UPDATE public.esteira_dark_roteiros SET data_postagem = %s, atualizado_em = now() WHERE id = %s", (arg.dia, r[0]))
            c.commit()
            print(f"V{r[2]} ({r[9]}): dia {arg.dia}")
        elif arg.cmd in ("programar", "desprogramar"):
            r = _achar(q, arg.id)
            # As funções do Hub conferem o login do Davi: roda como ele (conexão de serviço + claims do dono), igual à tela.
            q.execute("SELECT id FROM auth.users WHERE lower(email) = 'eu.daviqueiroz22@gmail.com'")
            uid = str(q.fetchone()[0])
            q.execute("SELECT set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true), set_config('role', 'authenticated', true)", (json.dumps({"sub": uid, "role": "authenticated"}), uid))
            if arg.cmd == "programar":
                from datetime import datetime, timezone, timedelta
                try:
                    quando = datetime.fromisoformat(arg.quando).replace(tzinfo=timezone(timedelta(hours=-3)))
                except ValueError:
                    sys.exit("Use AAAA-MM-DDTHH:MM (horário de Brasília).")
                q.execute("SELECT public.programar_roteiro_dark(%s::uuid, %s::timestamptz, %s)", (r[0], quando.isoformat(), arg.legenda or r[3]))
                print(f"V{r[2]} ({r[9]}): programado para {arg.quando} (Brasília)")
            else:
                q.execute("SELECT public.desprogramar_roteiro_dark(%s::uuid)", (r[0],))
                print(f"V{r[2]} ({r[9]}): desmarcado (volta para aprovado)")
            c.commit()
    finally:
        c.close()


if __name__ == "__main__":
    main()
