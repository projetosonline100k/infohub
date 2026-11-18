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

REGRA = """REGRA DE CÓDIGO (vale para você e para todos os agentes do Infopro): quem edita o código é o Atlas, no Mac, que é onde está o repositório. Você NÃO edita código do sistema (src/, src-tauri/, supabase/, api/, tests/, scripts/), não faz migração, deploy, commit nem merge.
MAS o Davi quer que você RESOLVA o que ele pediu, não que largue na fila (18/11/2026: "a fila está demorando e eu não sei como está"). Se o pedido exige mudar o app, o banco, um script ou uma integração, use o comando FAZER: ele abre o pedido com prioridade alta, o Atlas pega em segundos e VOCÊ ESPERA o resultado, para responder ao Davi "feito" (ou "não deu") na mesma conversa:
  python3 scripts/fila.py fazer --origem "<seu nome>" --titulo "<curto>" <<'FIM'
  <descrição completa e autossuficiente: o que o Davi pediu (nas palavras dele), onde fica, e como saber que ficou pronto>
  FIM
Rode com a ferramenta Bash e timeout de 600000 ms. Ele mostra o andamento e termina com o relatório do Atlas (o que mudou, o que foi testado, o que NÃO foi). Se escrever "AINDA EM ANDAMENTO", rode `python3 scripts/fila.py esperar <id>` (mesmo timeout) até sair o resultado; não desista antes de uns 30 minutos.
Quando terminar, conte ao Davi em poucas linhas o resultado REAL (inclusive se não foi testado ou deu erro); nunca diga que está pronto sem o relatório confirmar.
Antes, confira `python3 scripts/fila.py listar` para não duplicar pedido. O seu trabalho de sempre (conteúdo, arquivos de saída, os scripts que já existem) continua normal: a regra é só sobre mudar código.

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


def esperar(pid_prefixo, limite_s=540):
    """Espera o pedido terminar (até ~9 min, cabe no timeout do Bash dos agentes) e imprime o relatório. Sai com 0 se concluiu, 1 se deu erro, 2 se ainda não terminou."""
    import time
    from migration_db import connect
    ini, ultimo = time.time(), None
    while True:
        c = connect()
        try:
            q = c.cursor()
            q.execute("SELECT id, status, resultado, erro, titulo FROM public.ponte_pedidos WHERE id::text LIKE %s ORDER BY criado_em DESC LIMIT 1", (pid_prefixo + "%",))
            r = q.fetchone()
        finally:
            c.close()
        if not r:
            print("Pedido não encontrado."); return 1
        _id, status, resultado, erro, titulo = r
        if status == "concluido":
            print(f"CONCLUÍDO — {titulo}\n\n{(resultado or '').strip()}"); return 0
        if status == "erro":
            print(f"DEU ERRO — {titulo}\n\n{(erro or '').strip()}\n{(resultado or '').strip()}"); return 1
        if status == "aguardando_aprovacao" and (resultado or "").startswith("Precisa da aprovação"):
            print(f"PRECISA DA APROVAÇÃO DO DAVI — {titulo}\n{resultado}\nO Davi aprova em `python3 scripts/ponte.py aprovar {str(_id)[:8]}` (ou pelo sino do app). Avise-o."); return 2
        if status != ultimo:
            print(f"[{int(time.time() - ini)}s] {status.replace('_', ' ')}…", flush=True); ultimo = status
        if time.time() - ini > limite_s:
            print(f"AINDA EM ANDAMENTO ({status}). Rode de novo: python3 scripts/fila.py esperar {str(_id)[:8]}"); return 2
        time.sleep(4)


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
    f = sub.add_parser("fazer", help="abre o pedido (prioridade alta) e espera o Atlas terminar")
    f.add_argument("--origem", required=True)
    f.add_argument("--titulo", required=True)
    f.add_argument("descricao", nargs="*", help="ou pela entrada padrão")
    e = sub.add_parser("esperar", help="espera um pedido já aberto terminar")
    e.add_argument("id")
    sub.add_parser("listar")
    arg = p.parse_args()
    if arg.cmd == "listar":
        listar()
    elif arg.cmd == "esperar":
        sys.exit(esperar(arg.id))
    elif arg.cmd == "fazer":
        texto = " ".join(arg.descricao).strip() or sys.stdin.read().strip()
        if len(texto) < 20:
            sys.exit("Descreva o pedido com detalhes (o que o Davi pediu, onde fica, como saber que ficou pronto).")
        pid, novo = pedir(arg.origem, arg.titulo, texto, "alta")
        print(("Pedido aberto: " if novo else "Já existe um pedido aberto igual: ") + pid[:8], flush=True)
        sys.exit(esperar(pid[:8]))
    else:
        texto = " ".join(arg.descricao).strip() or sys.stdin.read().strip()
        if len(texto) < 20:
            sys.exit("Descreva o pedido com detalhes (o que o Davi pediu, onde fica, como saber que ficou pronto).")
        pid, novo = pedir(arg.origem, arg.titulo, texto, arg.prioridade)
        print(("Pedido na fila: " if novo else "Já existe um pedido aberto igual: ") + pid[:8])
