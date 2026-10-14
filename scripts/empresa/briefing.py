"""Conversa de briefing entre o Davi e um funcionário da empresa (antes da
tarefa existir). Quem responde é o Claude em segundo plano, pelo ouvinte do
Jarvis (scripts/jarvis-ouvinte.py), fazendo o papel do funcionário.

  python3 scripts/empresa/briefing.py contexto <briefing_id>      → projeto, funcionário, manual e conversa
  python3 scripts/empresa/briefing.py responder <briefing_id> <<'FIM'
  texto da resposta
  FIM
  python3 scripts/empresa/briefing.py propor <briefing_id> <<'FIM'
  {"titulo": "...", "entendimento": "...", "entregas": ["..."], "consigo": "sim|em_parte|nao",
   "limites": "...", "precisa_de": ["..."], "prazo_sugerido": "AAAA-MM-DD", "tipo": "copy"}
  FIM
  python3 scripts/empresa/briefing.py pegar                       → (ouvinte) marca as mensagens novas como lidas

Só escreve em briefings/briefing_mensagens. A tarefa só nasce quando o Davi
clica em "Confirmar" no app."""
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

TIPOS = {'edicao', 'carrossel', 'programacao', 'copy', 'pagina', 'metricas', 'gravacao'}
CONSIGO = {'sim', 'em_parte', 'nao'}


def slug(nome):
    s = unicodedata.normalize('NFD', nome).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def manual_do(nome):
    achados = sorted((RAIZ / 'docs/agentes').glob(f'{slug(nome)}-*.md')) + sorted((RAIZ / 'docs/agentes').glob(f'{slug(nome)}.md'))
    return achados[0] if achados else None


def pegar():
    """Marca as mensagens 'enviada' como 'lida' e devolve os briefings que têm mensagem nova."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.briefing_mensagens SET status = 'lida'
                      WHERE status = 'enviada' RETURNING briefing_id""")
        ids = sorted({str(r[0]) for r in q.fetchall()})
        c.commit()
        return ids
    finally:
        c.close()


def contexto(bid):
    c = connect()
    try:
        q = c.cursor()
        q.execute('SET TRANSACTION READ ONLY')
        q.execute("""SELECT b.status, b.proposta, b.cliente_id, cl.nome_especialista, cl.nicho,
                            m.nome, m.funcao, m.responsabilidades, m.eh_ia, s.nome
                       FROM briefings b JOIN clientes cl ON cl.id = b.cliente_id
                       JOIN membros m ON m.id = b.membro_id LEFT JOIN setores s ON s.id = m.setor_id
                      WHERE b.id = %s""", (bid,))
        r = q.fetchone()
        if not r:
            raise SystemExit('briefing não encontrado')
        status, proposta, cliente_id, especialista, nicho, nome, funcao, resp, eh_ia, setor = r
        q.execute("""SELECT nome_produto, status FROM produtos_cliente WHERE cliente_id = %s ORDER BY status, nome_produto""", (cliente_id,))
        produtos = q.fetchall()
        q.execute("""SELECT papel, texto, criada_em FROM briefing_mensagens WHERE briefing_id = %s ORDER BY criada_em""", (bid,))
        msgs = q.fetchall()
    finally:
        c.rollback()
        c.close()
    manual = manual_do(nome)
    print(f'Projeto: {especialista} (nicho: {nicho or "-"}) · cliente_id {cliente_id}')
    print('Produtos: ' + (', '.join(f'{p} ({s})' for p, s in produtos) or 'nenhum'))
    print(f'Funcionário: {nome} · {funcao or "-"} · setor {setor or "-"} · {"IA" if eh_ia else "PESSOA (você ajuda a detalhar o pedido para ela)"}')
    print('Responsabilidades: ' + ', '.join(resp or []))
    print(f'Manual: {manual.relative_to(RAIZ) if manual else "(não tem)"}')
    print(f'Inteligência: python3 scripts/inteligencia/ler.py --cliente {cliente_id} --agente "{nome.lower()}"')
    print(f'Status do briefing: {status}')
    if proposta:
        print('Proposta já gravada: ' + json.dumps(proposta, ensure_ascii=False))
    print('\nConversa:')
    for papel, texto, quando in msgs:
        print(f'[{quando:%d/%m %H:%M}] {"Davi" if papel == "davi" else nome}: {texto}')


def responder(bid, texto):
    texto = texto.strip()
    if not texto:
        raise SystemExit('resposta vazia')
    c = connect()
    try:
        q = c.cursor()
        q.execute("INSERT INTO public.briefing_mensagens(briefing_id, papel, texto) VALUES (%s, 'funcionario', %s)", (bid, texto))
        q.execute("UPDATE public.briefing_mensagens SET status = 'respondida' WHERE briefing_id = %s AND status IN ('enviada', 'lida')", (bid,))
        c.commit()
    finally:
        c.close()
    print('RESPONDIDO')


def validar(p):
    if not isinstance(p, dict):
        raise SystemExit('a proposta precisa ser um objeto JSON')
    if not str(p.get('titulo', '')).strip():
        raise SystemExit('falta "titulo"')
    if not str(p.get('entendimento', '')).strip():
        raise SystemExit('falta "entendimento"')
    if p.get('consigo') not in CONSIGO:
        raise SystemExit('"consigo" precisa ser sim, em_parte ou nao')
    if p.get('tipo') and p['tipo'] not in TIPOS:
        raise SystemExit(f'"tipo" precisa ser um de {sorted(TIPOS)}')
    if p.get('prazo_sugerido') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(p['prazo_sugerido'])):
        raise SystemExit('"prazo_sugerido" no formato AAAA-MM-DD')
    for campo in ('entregas', 'precisa_de'):
        if campo in p and not isinstance(p[campo], list):
            raise SystemExit(f'"{campo}" precisa ser uma lista')
    p['titulo'] = str(p['titulo']).strip()[:120]
    return p


def propor(bid, bruto):
    p = validar(json.loads(bruto))
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.briefings SET proposta = %s::jsonb, atualizado_em = now() WHERE id = %s AND status = 'conversando'",
                  (json.dumps(p, ensure_ascii=False), bid))
        if q.rowcount != 1:
            raise SystemExit('briefing não está em conversa')
        c.commit()
    finally:
        c.close()
    print('PROPOSTA_GRAVADA')


def sem_resposta(bid):
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT count(*) FROM public.briefing_mensagens WHERE briefing_id = %s AND status = 'lida'", (bid,))
        return q.fetchone()[0] > 0
    finally:
        c.close()


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    cmd = args[0]
    if cmd == 'pegar':
        print(json.dumps(pegar()))
    elif cmd == 'contexto':
        contexto(args[1])
    elif cmd == 'responder':
        responder(args[1], sys.stdin.read())
    elif cmd == 'propor':
        propor(args[1], sys.stdin.read())
    else:
        print(__doc__)
        sys.exit(1)
