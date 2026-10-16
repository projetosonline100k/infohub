"""Kanban de melhorias do Infopro (Pedro, IA de melhorias — pedido do Davi, 15/10/2026).
Ideias → Pode fazer (o Davi arrasta) → Fazendo (o Pedro implementa sozinho) → Feito.
"Não é prioridade agora" (adiada) guarda ideia sem descartar. Rodada (16/10): das 8h às
22h, a cada 30 min, o ouvinte chama o Pedro pra buscar até 5 ideias novas (selo NOVO).

  python3 scripts/pedro/melhorias.py listar                       → o quadro todo
  python3 scripts/pedro/melhorias.py propor [--rodada] <<'FIM'    → novas ideias (lista JSON; pula título repetido; --rodada: no máx. 5)
  [{"titulo": "...", "problema": "...", "porque": "...", "sugestao": "...", "impacto": 1-3, "esforco": 1-3}]
  FIM
  python3 scripts/pedro/melhorias.py contexto <id>                → a ideia que está implementando
  python3 scripts/pedro/melhorias.py progresso <id> <0-100> "<o que está fazendo>"
  python3 scripts/pedro/melhorias.py pronto <id> "<resumo de 1 linha>" <<'FIM'
  <briefing pro Davi: o que mudou · onde fica no app · como usar (passo a passo) · o que testar · limites>
  FIM
  python3 scripts/pedro/melhorias.py pendente <id> "<por que parou>" <<'FIM'   → depende do Davi
  ["criar a chave X em …", "decidir se …"]
  FIM
  python3 scripts/pedro/melhorias.py retomar <id>                   → (na conversa) o Davi resolveu: volta pra fila
  python3 scripts/pedro/melhorias.py erro <id> "<por que não deu>"
  (o ouvinte usa: pegar, situacao, feito, rodada_devida, marcar_rodada, prompt_rodada, contar_novas)"""
import json
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

CLIENTE = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'   # projeto Davi Queiroz (onde o Pedro é IA)
# Rodada automática (combinado com o Davi em 16/10): das 8h às 22h, de 30 em 30 min, até 5 ideias boas.
HORA_INICIO, HORA_FIM, INTERVALO_MIN, MAX_RODADA = 8, 22, 30, 5


def _q(sql, args=(), um=False, commit=False):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        r = (q.fetchone() if um else q.fetchall()) if q.description else None
        if commit:
            c.commit()
        return r
    finally:
        c.close()


def listar():
    for st, titulo, imp, esf, mid, falta in _q("""SELECT m.status, m.titulo, m.impacto, m.esforco, m.id,
                                                    (SELECT string_agg(s.servico, ', ') FROM servicos_sinal s WHERE s.user_id = m.user_id
                                                      AND s.servico = ANY(m.reiniciar) AND s.iniciado_em < m.concluido_em)
                                               FROM melhorias_sistema m WHERE m.cliente_id = %s
                                             ORDER BY array_position(ARRAY['fazendo','pode_fazer','pendente','ideia','adiada','erro','feito','descartada'], m.status), m.ordem, m.criado_em""", (CLIENTE,)):
        print(f'[{st}{f" · falta reiniciar: {falta}" if falta else ""}] {titulo} (impacto {imp or "-"}, esforço {esf or "-"}) · {mid}')


def propor(bruto, rodada=False):
    try:
        ideias = json.loads(bruto)
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    if isinstance(ideias, dict):
        ideias = [ideias]
    # Sem repetir nada que já passou pelo quadro (inclusive descartada e "não é prioridade agora").
    existentes = {t.strip().lower() for (t,) in _q("SELECT titulo FROM melhorias_sistema WHERE cliente_id = %s", (CLIENTE,))}
    novas = 0
    c = connect()
    try:
        q = c.cursor()
        for i in ideias:
            if rodada and novas >= MAX_RODADA:
                break
            t = str(i.get('titulo', '')).strip()
            if not t or t.lower() in existentes:
                continue
            imp = i.get('impacto'); esf = i.get('esforco')
            q.execute("""INSERT INTO melhorias_sistema (cliente_id, user_id, titulo, problema, porque, sugestao, impacto, esforco, origem)
                         SELECT %s, c.user_id, %s, %s, %s, %s, %s, %s, 'pedro' FROM clientes c WHERE c.id = %s""",
                      (CLIENTE, t[:160], i.get('problema'), i.get('porque'), i.get('sugestao'),
                       imp if imp in (1, 2, 3) else None, esf if esf in (1, 2, 3) else None, CLIENTE))
            existentes.add(t.lower())
            novas += 1
        c.commit()
    finally:
        c.close()
    print(f'PROPOSTAS {novas}')


def pegar():
    r = _q("""UPDATE melhorias_sistema SET status = 'fazendo', progresso = 5, agora = 'começando', resultado = NULL
               WHERE id = (SELECT id FROM melhorias_sistema WHERE cliente_id = %s AND status = 'pode_fazer'
                            ORDER BY ordem, criado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING id""", (CLIENTE,), um=True, commit=True)
    return str(r[0]) if r else None


def contexto(mid):
    r = _q("SELECT titulo, problema, porque, sugestao, impacto, esforco, origem, notas, pendencias, status, resultado FROM melhorias_sistema WHERE id = %s", (mid,), um=True)
    if not r:
        raise SystemExit('melhoria não encontrada')
    t, p, pq, s, i, e, o, notas, pend, st, res = r
    print(f'Melhoria aprovada pelo Davi: {t}\nVeio de: {"ideia do Davi" if o == "davi" else "ideia sua (Pedro)"} · impacto {i or "-"} · esforço {e or "-"}')
    print(f'Problema: {p or "-"}\nPor que importa: {pq or "-"}\nSugestão: {s or "-"}')
    if notas:
        print(f'\nDETALHES DO DAVI (valem mais que a sugestão; siga):\n{notas}')
    if pend:
        print(f'\nPENDÊNCIAS COM O DAVI (status {st}; motivo: {res or "-"}):')
        for it in pend:
            print(f'  [{"x" if it.get("feito") else " "}] {it.get("texto")}')
        print('Se continuar de um ramo que já tem trabalho seu (git log), siga de onde parou.')


def progresso(mid, pct, agora):
    _q("UPDATE melhorias_sistema SET progresso = %s, agora = %s WHERE id = %s AND status = 'fazendo'",
       (max(5, min(95, int(pct))), agora.strip()[:200], mid), commit=True)
    print('OK')


def pronto(mid, resumo, briefing=''):
    """`briefing` (stdin): o que o Davi lê no kanban — o que mudou, onde fica, como usar, o que testar, limites."""
    if len((briefing or '').strip()) < 120:
        raise SystemExit('Faltou o briefing pro Davi (mande pelo stdin, com as seções do manual: o que mudou, onde fica, como usar, o que testar, limites).')
    _q("UPDATE melhorias_sistema SET progresso = 95, agora = 'juntando no sistema', resultado = %s, briefing = %s WHERE id = %s AND status = 'fazendo'",
       (resumo.strip()[:2000], briefing.strip()[:12000], mid), commit=True)
    print('PRONTO (o ouvinte junta no sistema)')


def pendente(mid, motivo, bruto):
    """Depende do Davi (chave, decisão, login, arquivo…): para, guarda o que já fez no ramo e
    mostra a lista do que ele precisa fazer (coluna Pendências). stdin: lista JSON de textos."""
    try:
        itens = json.loads(bruto) if bruto.strip() else []
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    itens = [{'texto': str(t).strip()[:300], 'feito': False} for t in (itens if isinstance(itens, list) else [itens]) if str(t).strip()]
    if not itens:
        raise SystemExit('Mande a lista do que o Davi precisa fazer (JSON: ["...", "..."]).')
    _q("""UPDATE melhorias_sistema SET status = 'pendente', agora = NULL, resultado = %s, pendencias = %s::jsonb
           WHERE id = %s""", (motivo.strip()[:1000], json.dumps(itens, ensure_ascii=False), mid), commit=True)
    print('PENDENTE (o ouvinte guarda o que você já fez no ramo)')


def retomar(mid):
    """O Davi resolveu as pendências: volta pra fila de implementação (continua do ramo)."""
    r = _q("UPDATE melhorias_sistema SET status = 'pode_fazer' WHERE id = %s AND status = 'pendente' RETURNING id", (mid,), um=True, commit=True)
    print('RETOMADA' if r else 'nada a fazer (não estava pendente)')


def erro(mid, motivo):
    _q("UPDATE melhorias_sistema SET status = 'erro', agora = NULL, resultado = %s WHERE id = %s",
       (motivo.strip()[:2000], mid), commit=True)
    print('ERRO REGISTRADO')


# Arquivos que só valem depois de reiniciar o serviço (16/10: a cobrança foi pra
# Feito, mas mexia no jarvis-ouvinte.py e o ouvinte no ar seguiu com o código
# antigo). Os módulos que o ouvinte recarrega sozinho (briefing, execucao,
# melhorias, cobranca_rodada) não entram. O Danilo e o Roy leem o
# jarvis-ouvinte.py de novo a cada chamada; o código deles mesmos, não.
REINICIAR = {
    'ouvinte': ('scripts/jarvis-ouvinte.py', 'scripts/migration_db.py'),
    'danilo': ('scripts/danilo/',),
    'roy': ('scripts/roy/',),
}


def servicos_a_reiniciar(arquivos):
    return sorted(s for s, prefixos in REINICIAR.items()
                  if any(a.endswith('.py') and a.startswith(prefixos) for a in arquivos))


def feito(mid, sha):
    """Chamado pelo ouvinte logo depois do merge (ORIG_HEAD = o main de antes)."""
    import subprocess
    r = subprocess.run(['git', 'diff', '--name-only', 'ORIG_HEAD', 'HEAD'], cwd=RAIZ, capture_output=True, text=True)
    servicos = servicos_a_reiniciar(r.stdout.split()) if r.returncode == 0 else []
    _q("UPDATE melhorias_sistema SET status = 'feito', progresso = 100, agora = NULL, commit_sha = %s, reiniciar = %s::text[] WHERE id = %s",
       (sha, servicos or None, mid), commit=True)


def reenfileirar():
    """Ao ligar o ouvinte: melhoria que estava em "fazendo" volta pra "pode_fazer"."""
    r = _q("UPDATE melhorias_sistema SET status = 'pode_fazer', agora = NULL, progresso = NULL WHERE status = 'fazendo' RETURNING id", commit=True)
    return len(r or [])


# ---------------------------------------------------------------- rodada automática
# O horário e o intervalo ficam aqui (o ouvinte recarrega este módulo: mudar não pede reinício).
# A última rodada fica em servicos_sinal ('pedro_rodada'): o kanban mostra "última busca às HH:MM".

def rodada_devida(agora=None):
    agora = agora or datetime.now()
    if not (HORA_INICIO <= agora.hour < HORA_FIM):
        return False
    r = _q("""SELECT extract(epoch FROM now() - s.ultimo_sinal) FROM servicos_sinal s JOIN clientes c ON c.user_id = s.user_id
               WHERE c.id = %s AND s.servico = 'pedro_rodada'""", (CLIENTE,), um=True)
    return r is None or r[0] >= INTERVALO_MIN * 60 - 30


def marcar_rodada():
    """Grava o começo da rodada (antes de chamar o Claude: se ela falhar, não repete em seguida)."""
    _q("""INSERT INTO servicos_sinal (user_id, servico, ultimo_sinal, iniciado_em)
           SELECT c.user_id, 'pedro_rodada', now(), now() FROM clientes c WHERE c.id = %s
           ON CONFLICT (user_id, servico) DO UPDATE SET ultimo_sinal = now(), iniciado_em = now()""", (CLIENTE,), commit=True)


def contar_novas():
    """Quantas ideias o Pedro trouxe desde o começo da última rodada (pro log do ouvinte)."""
    return _q("""SELECT count(*) FROM melhorias_sistema m WHERE m.cliente_id = %s AND m.origem = 'pedro'
                  AND m.criado_em >= (SELECT s.iniciado_em FROM servicos_sinal s JOIN clientes c ON c.user_id = s.user_id
                                       WHERE c.id = %s AND s.servico = 'pedro_rodada')""", (CLIENTE, CLIENTE), um=True)[0]


# Cada rodada começa por um lugar diferente, pra não achar sempre as mesmas coisas.
FOCOS = [
    "os LOGS: ~/.infopro-hub/ouvinte/ouvinte.log, ~/.infopro-hub/danilo/servico.log e ~/.infopro-hub/roy/servico.log (leia só o fim, com tail -n 400): erros que se repetem, coisas que travam, demoras",
    "os DADOS (python3 scripts/consulta.py, somente leitura): tarefas paradas ou atrasadas, entregas reprovadas ou devolvidas, erros gravados, filas que não andam, recursos que ninguém usa",
    "as TELAS (src/pages e src/components): o que é lento, confuso, repetitivo ou tem passos demais para o Davi e a equipe",
]


def prompt_rodada(agora=None):
    agora = agora or datetime.now()
    foco = FOCOS[(agora.hour * 2 + agora.minute // 30) % len(FOCOS)]
    return f"""Você é o Pedro, IA de melhorias do Infopro Hub. Rodada automática de ideias (o Davi pediu: "sempre fique trazendo ideias do que melhorar e atualizando no kanban"). Ele não vê este terminal. Hoje é {agora:%d/%m/%Y %H:%M}.

1. Leia docs/agentes/pedro-melhorias.md (seção "Onde procurar melhorias"), o CLAUDE.md e os aprendizados: python3 scripts/inteligencia/ler.py --cliente {CLIENTE} --agente "pedro" --saida "$(mktemp -d)" (siga o "SIGA SEMPRE").
2. Veja o quadro inteiro, para NÃO repetir nada (nem ideia parecida com outro título, nem o que já foi feito, descartado ou está em "não é prioridade agora"): python3 scripts/pedro/melhorias.py listar
3. Investigue. Nesta rodada comece por {foco}. Depois, se sobrar tempo, olhe os outros lugares (logs, dados, telas).
4. Escolha até {MAX_RODADA} ideias BOAS. Cada uma precisa de evidência concreta que você viu agora (linha do log, número da consulta, arquivo:linha da tela). Se só achar 2 boas, traga 2; se não achar nenhuma, não traga nada. Nada de ideia genérica ("melhorar UX") nem para completar número.
5. Grave no kanban (o Davi vê com o selo NOVO):
   python3 scripts/pedro/melhorias.py propor --rodada <<'FIM'
   [{{"titulo": "curto, no idioma do Davi", "problema": "o que acontece hoje + a evidência", "porque": "o resultado para a equipe ou o negócio", "sugestao": "o que fazer, em 2 a 4 frases", "impacto": 1-3, "esforco": 1-3}}]
   FIM
Regras: SOMENTE LEITURA. Não edite nenhum arquivo, não escreva no banco (fora o propor), sem git, não reinicie nada, não envie nada a ninguém. Seja rápido (no máximo uns 15 minutos). No fim, responda só com os títulos que gravou (ou "nenhuma ideia nova")."""


def situacao(mid):
    r = _q("SELECT status, resultado, agora FROM melhorias_sistema WHERE id = %s", (mid,), um=True)
    return r


if __name__ == '__main__':
    a = sys.argv[1:]
    cmd = a[0] if a else ''
    if cmd == 'listar':
        listar()
    elif cmd == 'propor':
        propor(sys.stdin.read(), rodada='--rodada' in a)
    elif cmd == 'contexto' and len(a) > 1:
        contexto(a[1])
    elif cmd == 'progresso' and len(a) > 3:
        progresso(a[1], a[2], a[3])
    elif cmd == 'pronto' and len(a) > 2:
        pronto(a[1], a[2], sys.stdin.read() if not sys.stdin.isatty() else '')
    elif cmd == 'pendente' and len(a) > 2:
        pendente(a[1], a[2], sys.stdin.read())
    elif cmd == 'retomar' and len(a) > 1:
        retomar(a[1])
    elif cmd == 'erro' and len(a) > 2:
        erro(a[1], a[2])
    elif cmd == 'pegar':
        print(json.dumps(pegar()))
    else:
        print(__doc__)
        sys.exit(1)
