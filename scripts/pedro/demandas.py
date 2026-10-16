"""Guia "Passar demanda" do kanban do Pedro (pedido do Davi, 16/10/2026: "caçar o que
passar para o pessoal … para agente nao ter pessoa ociosa, afinal, tempo é dinheiro").
Nas rodadas de 30 min (junto com as melhorias, prompt em melhorias.py) o Pedro vê quem
está sem tarefa ou com pouca e sugere UM cartão por pessoa. Quem decide é o Davi: no app,
"Passar" abre a conversa de briefing com o funcionário; a tarefa só nasce quando ele confirma.

  python3 scripts/pedro/demandas.py carga                         → quem está ocioso, metas e produtos
  python3 scripts/pedro/demandas.py listar                        → as sugestões já feitas (pra não repetir)
  python3 scripts/pedro/demandas.py propor [--rodada] <<'FIM'     → novas sugestões (lista JSON)
  [{"membro": "Ítalo", "titulo": "o que passar", "porque": "meta/produto/gargalo", "produto": "Core",
    "precisa": "o que a pessoa vai precisar do Davi", "prazo_sugerido": "AAAA-MM-DD"}]
  FIM

Regras do propor: só quem está com pouca carga (até POUCA tarefas abertas), uma sugestão
aberta por pessoa (pula quem já tem cartão em Sugestões) e sem repetir título."""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

CLIENTE = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'   # projeto Davi Queiroz (onde o Pedro é IA)
POUCA = 1                                          # até 1 tarefa aberta = pouca carga (0 = ocioso)
FORA = ('davi', 'atlas', 'jarvis', 'pedro')        # o dono, o gestor e o próprio Pedro
MAX_RODADA = 5
# Tarefa aberta = na fila ou em andamento (aguardando aprovação espera o Davi, não ocupa a pessoa).
ABERTA = "a.deleted_at IS NULL AND NOT a.concluida AND coalesce(a.situacao, 'fila') IN ('fila', 'andamento')"


def _q(sql, args=()):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        return q.fetchall() if q.description else None
    finally:
        c.close()


def equipe():
    """[(id, nome, funcao, abertas, sugestao_aberta)] de quem pode receber demanda, menos carga primeiro."""
    return _q(f"""SELECT m.id, m.nome, m.funcao,
                         (SELECT count(*) FROM atividades a WHERE a.responsavel_id = m.id AND {ABERTA}),
                         (SELECT d.titulo FROM demandas_sugeridas d WHERE d.membro_id = m.id AND d.status = 'ideia' LIMIT 1)
                    FROM membros m WHERE m.cliente_id = %s AND m.ativo AND lower(m.nome) <> ALL(%s)
                   ORDER BY 4, m.ordem""", (CLIENTE, list(FORA)))


def carga():
    for _, nome, funcao, n, sug in equipe():
        nivel = 'OCIOSO' if n == 0 else 'pouca carga' if n <= POUCA else 'ocupado'
        print(f'{nome} ({funcao or "-"}): {n} tarefa(s) aberta(s) · {nivel}' + (f' · já tem sugestão aberta: "{sug}"' if sug else ''))
    meta = _q("SELECT meta_atual FROM clientes WHERE id = %s", (CLIENTE,))
    print(f'\nMeta atual do projeto: {(meta[0][0] if meta else None) or "-"}')
    print('Produtos:', ', '.join(f'{n} ({s})' for n, s in _q(
        "SELECT nome_produto, status FROM produtos_cliente WHERE cliente_id = %s ORDER BY status, nome_produto", (CLIENTE,))) or '-')
    print('\nÚltimas tarefas de cada um (pra saber o que cada um faz):')
    for nome, titulo, sit in _q(f"""SELECT m.nome, a.titulo, coalesce(a.situacao, 'fila') FROM membros m
                                    JOIN LATERAL (SELECT a.titulo, a.situacao FROM atividades a WHERE a.responsavel_id = m.id
                                                   AND a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 3) a ON true
                                   WHERE m.cliente_id = %s AND m.ativo AND lower(m.nome) <> ALL(%s) ORDER BY m.ordem""",
                                (CLIENTE, list(FORA))):
        print(f'  {nome}: {titulo} [{sit}]')


def listar():
    for st, nome, titulo, criado in _q("""SELECT d.status, m.nome, d.titulo, d.criado_em FROM demandas_sugeridas d
                                           JOIN membros m ON m.id = d.membro_id WHERE d.cliente_id = %s
                                          ORDER BY d.criado_em DESC LIMIT 80""", (CLIENTE,)):
        print(f'[{st}] {nome}: {titulo} ({criado:%d/%m})')


def _nome(s):
    return re.sub(r'\s+', ' ', str(s or '').strip().lower())


def propor(bruto, rodada=False):
    try:
        itens = json.loads(bruto)
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    if isinstance(itens, dict):
        itens = [itens]
    pessoas = {_nome(nome): (mid, n, sug) for mid, nome, _, n, sug in equipe()}
    existentes = {_nome(t) for (t,) in _q("SELECT titulo FROM demandas_sugeridas WHERE cliente_id = %s", (CLIENTE,))}
    novas, pulei = 0, []
    c = connect()
    try:
        q = c.cursor()
        for i in itens:
            if rodada and novas >= MAX_RODADA:
                break
            quem, t = _nome(i.get('membro')), str(i.get('titulo', '')).strip()
            if quem not in pessoas:
                pulei.append(f'{i.get("membro")}: não é da equipe (ou é o Davi/Atlas/Pedro)')
                continue
            mid, n, sug = pessoas[quem]
            if not t or _nome(t) in existentes:
                pulei.append(f'{i.get("membro")}: título vazio ou repetido')
                continue
            if n > POUCA:
                pulei.append(f'{i.get("membro")}: já tem {n} tarefas abertas')
                continue
            if sug:
                pulei.append(f'{i.get("membro")}: já tem sugestão aberta ("{sug}")')
                continue
            prazo = str(i.get('prazo_sugerido') or '')
            q.execute("""INSERT INTO demandas_sugeridas (cliente_id, membro_id, titulo, porque, produto, precisa, prazo_sugerido)
                         VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                      (CLIENTE, mid, t[:160], i.get('porque'), (str(i.get('produto') or '').strip() or None),
                       i.get('precisa'), prazo if re.fullmatch(r'\d{4}-\d{2}-\d{2}', prazo) else None))
            existentes.add(_nome(t))
            pessoas[quem] = (mid, n, t)
            novas += 1
        c.commit()
    finally:
        c.close()
    print(f'DEMANDAS {novas}')
    for p in pulei:
        print('  pulei', p)


if __name__ == '__main__':
    a = sys.argv[1:]
    cmd = a[0] if a else ''
    if cmd == 'carga':
        carga()
    elif cmd == 'listar':
        listar()
    elif cmd == 'propor':
        propor(sys.stdin.read(), rodada='--rodada' in a)
    else:
        print(__doc__)
        sys.exit(1)
