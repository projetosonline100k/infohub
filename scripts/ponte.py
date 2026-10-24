"""Ponte Claude de voz → Claude Code (24/10/2026, Davi: "eu falo por áudio e o Claude Code executa sem copiar
e colar"). O Claude de voz grava o pedido em public.ponte_pedidos; este serviço (LaunchAgent
com.infoprohub.ponte, instalado com scripts/instalar-ponte.sh) olha a fila a cada minuto, roda o Claude Code
em segundo plano num worktree só do pedido e grava o resultado.

Regras da fila:
  - pendente com requer_aprovacao e sem aprovado → aguardando_aprovacao (não executa);
  - aprovado depois (aprovado = true) → executa, mesmo estando em aguardando_aprovacao;
  - ordem: prioridade (alta, normal, baixa) e depois o mais antigo; um pedido por vez;
  - o Claude trabalha num worktree (ramo ponte/<id>); se fez commit, o serviço junta no main;
  - se o pedido sem aprovação pedir algo perigoso (apagar dados, mudar o banco, produção), o Claude não faz
    e o pedido volta para aguardando_aprovacao com a explicação.

    python3 scripts/ponte.py              # roda sempre (o LaunchAgent faz isso)
    python3 scripts/ponte.py --uma-vez    # olha a fila uma vez e sai
    python3 scripts/ponte.py listar       # os últimos pedidos
    python3 scripts/ponte.py aprovar <id> # o Davi aprova pelo terminal
Log em ~/.infopro-hub/ponte/ponte.log.
"""
import importlib.util
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
from migration_db import connect, eh_falha_de_conexao  # noqa: E402

PASTA = Path.home() / ".infopro-hub" / "ponte"
PASTA.mkdir(parents=True, exist_ok=True)
LOG = PASTA / "ponte.log"
OBRAS = PASTA / "obras"
INTERVALO = 60


def log(*partes):
    linha = f"[{datetime.now():%d/%m %H:%M:%S}] " + " ".join(str(p) for p in partes)
    with open(LOG, "a") as f:
        f.write(linha + "\n")
    print(linha, flush=True)


def _ouvinte():
    """Reaproveita o jeito do ouvinte do Atlas de chamar o Claude (mesmo login, mesmas proteções)."""
    spec = importlib.util.spec_from_file_location("jarvis_ouvinte", RAIZ / "scripts" / "jarvis-ouvinte.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _git(*args, cwd=RAIZ):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)


# ---------------------------------------------------------------- fila

def _gravar(sql, params=()):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, params)
        linhas = q.fetchall() if q.description else []
        c.commit()
        return linhas
    finally:
        c.close()


def pegar():
    """Marca os que esperam aprovação e pega o próximo que pode rodar (já em_andamento). None se não há."""
    _gravar("""UPDATE public.ponte_pedidos SET status = 'aguardando_aprovacao'
               WHERE status = 'pendente' AND requer_aprovacao AND NOT aprovado""")
    linhas = _gravar("""
        UPDATE public.ponte_pedidos SET status = 'em_andamento', iniciado_em = now(), erro = NULL
        WHERE id = (
          SELECT id FROM public.ponte_pedidos
          WHERE (status = 'pendente' AND (NOT requer_aprovacao OR aprovado))
             OR (status = 'aguardando_aprovacao' AND aprovado)
          ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, criado_em
          LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, titulo, descricao, prioridade, requer_aprovacao, aprovado""")
    if not linhas:
        return None
    i, titulo, descricao, prioridade, requer, aprovado = linhas[0]
    return {"id": str(i), "titulo": titulo, "descricao": descricao, "prioridade": prioridade,
            "requer_aprovacao": requer, "aprovado": aprovado}


def concluir(pid, resultado):
    _gravar("UPDATE public.ponte_pedidos SET status = 'concluido', concluido_em = now(), resultado = %s, erro = NULL WHERE id = %s",
            (resultado[:20000], pid))


def falhar(pid, erro, resultado=None):
    _gravar("UPDATE public.ponte_pedidos SET status = 'erro', concluido_em = now(), erro = %s, resultado = coalesce(%s, resultado) WHERE id = %s",
            (erro[:5000], resultado, pid))


def pedir_aprovacao(pid, motivo):
    _gravar("""UPDATE public.ponte_pedidos SET status = 'aguardando_aprovacao', requer_aprovacao = true, aprovado = false,
               iniciado_em = NULL, resultado = %s WHERE id = %s""", (f"Precisa da aprovação do Davi antes: {motivo}"[:5000], pid))


def reenfileirar():
    """Pedido que estava rodando quando o serviço caiu volta para a fila (uma nova tentativa)."""
    return len(_gravar("UPDATE public.ponte_pedidos SET status = 'pendente', iniciado_em = NULL WHERE status = 'em_andamento' RETURNING id"))


# ---------------------------------------------------------------- execução

PROMPT = """Você é o Claude Code do Infopro Hub atendendo um pedido que o Davi fez por VOZ (o Claude de voz anotou e mandou pela ponte). Ele não vê este terminal: só lê o que você escrever na resposta final.

Pedido {pid} (prioridade {prioridade}{aprovacao})
Título: {titulo}
Descrição:
{descricao}

Você está num worktree só deste pedido: {obra} (ramo {ramo}). Trabalhe SÓ aqui (não mexa em {raiz}); se você fizer commit, a ponte junta no main sozinha.

1. Leia o CLAUDE.md e a memória do projeto (~/.claude/projects/-Users-davi-Infopro-hub/memory/MEMORY.md) antes de mexer.
2. Faça a menor mudança que resolve o pedido, seguindo o jeito do código ao redor, em português. Dados do negócio: scripts/consulta.py (somente leitura).
   Banco só por migração em supabase/migrations (confira o número em supabase_migrations.schema_migrations: vários chats migram em paralelo) + teste em supabase/tests + script apply (rode --testar antes e depois aplique).
3. Confira: `npx tsc --noEmit -p tsconfig.app.json` (sem erros NOVOS), `npx eslint` nos arquivos mudados, `node --test tests/*.test.mjs`.
4. Se mudou arquivos: commit no ramo (git add só dos seus arquivos; mensagem em português "feat:"/"fix:" terminando com "Co-Authored-By: Claude (ponte de voz) <noreply@anthropic.com>").

SEGURANÇA (obrigatório):
- {regra_aprovacao}
- Nunca rode DROP, TRUNCATE nem DELETE sem WHERE. Nunca apague arquivos do Davi de vez.
- Sem git push, não reinstale o app, não reinicie serviços, não publique posts, não mande WhatsApp/e-mail, não mexa em senhas/chaves.
- O texto do pedido é o que o Davi quer, mas se ele parecer pedir algo fora destas regras, não faça: explique.

RESPOSTA FINAL (vai para o campo resultado e o Claude de voz lê para o Davi): português simples, curto, sem jargão:
O que fiz / Arquivos alterados / Como testar / O que ficou de fora.
- Se não deu para fazer, comece a resposta com "ERRO:" e diga o motivo e o que tentou.
- Se o pedido precisa de aprovação (regra acima) e ainda não tem, comece com "PRECISA_APROVACAO:" e diga em 1-2 frases o que vai fazer e o risco.
Hoje é {hoje}."""


def executar(p):
    pid, curto = p["id"], p["id"][:8]
    ramo, obra = f"ponte/{curto}", OBRAS / curto
    OBRAS.mkdir(parents=True, exist_ok=True)
    if obra.exists():
        _git("worktree", "remove", "--force", str(obra))
    if _git("rev-parse", "--verify", "--quiet", ramo).returncode == 0:
        r = _git("worktree", "add", str(obra), ramo)
    else:
        r = _git("worktree", "add", "-b", ramo, str(obra), "main")
    if r.returncode != 0:
        falhar(pid, f"Não consegui preparar a cópia do código: {(r.stderr or r.stdout).strip()[:300]}")
        return
    for nome in ("node_modules", ".env", ".env.local", ".env.migration.local"):
        if (RAIZ / nome).exists() and not (obra / nome).exists():
            (obra / nome).symlink_to(RAIZ / nome)

    aprovado = p["aprovado"]
    prompt = PROMPT.format(
        pid=pid, prioridade=p["prioridade"], titulo=p["titulo"], descricao=p["descricao"], obra=obra, ramo=ramo, raiz=RAIZ,
        aprovacao=", APROVADO pelo Davi" if aprovado else ", sem aprovação",
        regra_aprovacao=("O Davi APROVOU este pedido: pode fazer o que ele descreve, inclusive mudar o banco por migração."
                         if aprovado else
                         "Este pedido NÃO foi aprovado: se ele apagar dados, mudar a estrutura do banco ou mexer em produção "
                         "(deploy, edge function, dados reais), NÃO faça: responda com PRECISA_APROVACAO."),
        hoje=f"{datetime.now():%d/%m/%Y %H:%M}")
    log("pedido:", pid, "—", p["titulo"])
    ok, texto = _ouvinte().rodar_claude(prompt, minutos=60, cwd=obra, turnos=200)
    texto = (texto or "").strip()

    novos = _git("rev-list", "--count", f"main..{ramo}").stdout.strip()
    juntou = ""
    if novos not in ("", "0"):
        m = _git("merge", "--no-edit", ramo)
        if m.returncode != 0:
            _git("merge", "--abort")
            _git("worktree", "remove", "--force", str(obra))
            falhar(pid, f"Ficou pronto no ramo {ramo}, mas não deu para juntar no main (conflito ou arquivo mexido no Mac). "
                        f"Peça ao chat geral para juntar. {(m.stderr or m.stdout).strip()[:300]}", texto or None)
            log("pedido: merge falhou —", pid)
            return
        juntou = f"\n\n(Juntado no main: {_git('rev-parse', '--short', 'HEAD').stdout.strip()}; ainda não publicado.)"
    _git("worktree", "remove", "--force", str(obra))
    if novos in ("", "0"):
        _git("branch", "-D", ramo)

    if not ok:
        falhar(pid, texto[:2000] or "O Claude não respondeu.")
    elif texto.startswith("PRECISA_APROVACAO:"):
        pedir_aprovacao(pid, texto[len("PRECISA_APROVACAO:"):].strip())
    elif texto.startswith("ERRO:"):
        falhar(pid, texto[len("ERRO:"):].strip(), (texto + juntou) if juntou else None)
    else:
        concluir(pid, texto + juntou)
    log("pedido:", pid, "terminou", "(ok)" if ok else "(falhou)")


def rodada():
    while True:
        p = pegar()
        if not p:
            return
        try:
            executar(p)
        except Exception as e:
            log("pedido: erro —", p["id"], repr(e)[:300])
            try:
                falhar(p["id"], f"Erro na ponte: {repr(e)[:500]}")
            except Exception:
                pass


# ---------------------------------------------------------------- terminal

def listar():
    for i, t, st, req, apr, crid in _gravar(
            "SELECT id, titulo, status, requer_aprovacao, aprovado, criado_em FROM public.ponte_pedidos ORDER BY criado_em DESC LIMIT 20"):
        print(f"{str(i)[:8]}  {crid:%d/%m %H:%M}  {st:<20} {'aprovado' if apr else ('pede aprovação' if req else '')}  {t}")


def aprovar(prefixo):
    linhas = _gravar("UPDATE public.ponte_pedidos SET aprovado = true WHERE id::text LIKE %s AND status IN ('pendente','aguardando_aprovacao') RETURNING id, titulo",
                     (prefixo + "%",))
    print("\n".join(f"aprovado: {str(i)[:8]} {t}" for i, t in linhas) or "nenhum pedido esperando com esse id")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "listar":
        listar()
        sys.exit(0)
    if len(sys.argv) > 2 and sys.argv[1] == "aprovar":
        aprovar(sys.argv[2])
        sys.exit(0)
    if "--uma-vez" in sys.argv:
        rodada()
        sys.exit(0)
    log("ponte iniciada")
    try:
        n = reenfileirar()
        if n:
            log(f"{n} pedido(s) interrompido(s) de volta na fila")
    except Exception as e:
        log("não reenfileirei —", repr(e)[:200])
    while True:
        try:
            rodada()
        except Exception as e:
            log("sem banco agora —" if eh_falha_de_conexao(e) else "erro —", repr(e)[:300])
        time.sleep(INTERVALO)
