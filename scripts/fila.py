"""Fila de desenvolvimento (12/11/2026, Davi: "todos os agentes que precisarem que alguém programe NÃO programam: disparam para a fila.
Quem programa é o Atlas (a ponte, scripts/ponte.py). Eu vejo a fila pelo sino").

Os agentes abrem pedidos aqui (public.ponte_pedidos); o serviço da ponte pega um por vez, roda o Claude Code num worktree e junta no main.

    python3 scripts/fila.py pedir --origem "Roy" --titulo "..." <<'FIM'
    descrição completa
    FIM
    python3 scripts/fila.py listar          # os últimos pedidos (para não duplicar)

Também importado pelo ouvinte: `REGRA` entra em todo prompt de agente que não é o Atlas, e `args_guarda()` liga o bloqueio de edição de código.
"""
import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

REGRA = """REGRA DA FILA (vale para você e para todos os agentes do Infopro): VOCÊ NÃO PROGRAMA.
Não edite nem crie código do sistema (src/, src-tauri/, supabase/, api/, tests/, scripts/), não faça migração, deploy, commit nem merge.
Se o que o Davi pediu exige mudar o app, o banco, um script ou uma integração, abra um PEDIDO NA FILA de desenvolvimento e diga a ele, em uma frase, que foi para a fila:
  python3 scripts/fila.py pedir --origem "<seu nome>" --titulo "<curto>" <<'FIM'
  <descrição completa e autossuficiente: o que o Davi pediu (nas palavras dele), onde fica, e como saber que ficou pronto>
  FIM
Antes, confira `python3 scripts/fila.py listar` para não duplicar. Quem programa é o Atlas (a ponte); o Davi acompanha a fila pelo sino do app.
O seu trabalho de sempre (conteúdo, arquivos de saída, os scripts que já existem) continua normal: a regra é só sobre mudar código.

"""


def com_regra(prompt):
    return REGRA + prompt


def args_guarda(python=None):
    """Argumentos do `claude -p` que ligam o bloqueio (hook PreToolUse) de edição de código do sistema."""
    comando = f"{python or sys.executable} {RAIZ / 'scripts' / 'guarda_codigo.py'}"
    cfg = {"hooks": {"PreToolUse": [{"matcher": "Edit|Write|NotebookEdit|MultiEdit|Bash", "hooks": [{"type": "command", "command": comando}]}]}}
    return ["--settings", json.dumps(cfg)]


def pedir(origem, titulo, descricao, prioridade="normal"):
    """Abre o pedido (já aprovado: o Davi acompanha pelo sino). Devolve (id, criado). Não duplica pedido aberto com o mesmo título."""
    from migration_db import connect
    titulo = titulo.strip()[:160]
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT id FROM public.ponte_pedidos WHERE titulo = %s AND status IN ('pendente', 'em_andamento', 'aguardando_aprovacao')", (titulo,))
        ja = q.fetchone()
        if ja:
            return str(ja[0]), False
        q.execute("""INSERT INTO public.ponte_pedidos (origem, titulo, descricao, prioridade, requer_aprovacao, aprovado)
                     VALUES (%s, %s, %s, %s, true, true) RETURNING id""",
                  (origem.strip().lower()[:40] or "agente", titulo, f"Pedido de {origem}. {descricao.strip()}"[:8000], prioridade if prioridade in ("baixa", "normal", "alta") else "normal"))
        pid = str(q.fetchone()[0])
        c.commit()
        return pid, True
    finally:
        c.close()


def listar(n=15):
    from migration_db import connect
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT left(id::text, 8), status, origem, titulo FROM public.ponte_pedidos ORDER BY criado_em DESC LIMIT %s", (n,))
        for r in q.fetchall():
            print(f"{r[0]}  {r[1]:<20} {r[2]:<12} {r[3]}")
    finally:
        c.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Fila de desenvolvimento")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("pedir")
    a.add_argument("--origem", required=True)
    a.add_argument("--titulo", required=True)
    a.add_argument("--prioridade", default="normal")
    a.add_argument("descricao", nargs="*", help="ou pela entrada padrão")
    sub.add_parser("listar")
    arg = p.parse_args()
    if arg.cmd == "listar":
        listar()
    else:
        texto = " ".join(arg.descricao).strip() or sys.stdin.read().strip()
        if len(texto) < 20:
            sys.exit("Descreva o pedido com detalhes (o que o Davi pediu, onde fica, como saber que ficou pronto).")
        pid, novo = pedir(arg.origem, arg.titulo, texto, arg.prioridade)
        print(("Pedido na fila: " if novo else "Já existe um pedido aberto igual: ") + pid[:8])
