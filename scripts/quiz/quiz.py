"""Quiz do Infopro (Conteúdo → Quiz). Usado pelo Roy na etapa 2 (criar) e nos ajustes.
Formato e fluxo: docs/QUIZ.md.

  python3 scripts/quiz/quiz.py ver <atividade_id>              → status, slug e a estrutura atual
  python3 scripts/quiz/quiz.py salvar <atividade_id> <<'FIM'   → valida e salva a estrutura
  { ...json... }
  FIM

`salvar` na etapa de criar (status criando) manda o quiz para 'revisar' e a
tarefa para a aprovação do Davi; em 'revisar' ou 'publicado' só atualiza."""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402


def validar(e):
    erros = []
    if not isinstance(e, dict):
        return ['a estrutura tem que ser um objeto JSON']
    perguntas, perfis = e.get('perguntas'), e.get('perfis')
    if not isinstance(perguntas, list) or not 1 <= len(perguntas) <= 30:
        erros.append('perguntas: lista de 1 a 30')
        perguntas = []
    if not isinstance(perfis, list) or not 1 <= len(perfis) <= 8:
        erros.append('perfis: lista de 1 a 8')
        perfis = []
    ids = set()
    for p in perfis:
        if not isinstance(p, dict) or not re.fullmatch(r'[a-z0-9_-]{1,40}', str(p.get('id', ''))) or not str(p.get('nome', '')).strip():
            erros.append(f'perfil inválido (precisa de id minúsculo e nome): {p}')
        else:
            ids.add(p['id'])
    vistos = set()
    for k, q in enumerate(perguntas, 1):
        if not isinstance(q, dict) or not str(q.get('texto', '')).strip():
            erros.append(f'pergunta {k} sem texto')
            continue
        if q.get('id') in vistos or not q.get('id'):
            q['id'] = f'q{k}'
        vistos.add(q['id'])
        ops = q.get('opcoes')
        if not isinstance(ops, list) or not 2 <= len(ops) <= 8:
            erros.append(f'pergunta {k}: de 2 a 8 opções')
            continue
        for o in ops:
            if not isinstance(o, dict) or not str(o.get('texto', '')).strip():
                erros.append(f'pergunta {k}: opção sem texto')
            elif o.get('perfil') and o['perfil'] not in ids:
                erros.append(f'pergunta {k}: perfil "{o["perfil"]}" não existe em perfis')
    cap = e.get('captura') or {}
    if cap and any(c not in ('nome', 'email', 'whatsapp') for c in cap.get('pedir', [])):
        erros.append('captura.pedir: só nome, email e whatsapp')
    return erros


def _quiz(q, aid):
    q.execute("""SELECT id, status, slug, titulo, estrutura FROM quizzes WHERE atividade_id = %s
                  ORDER BY criado_em DESC LIMIT 1""", (aid,))
    return q.fetchone()


def ver(aid):
    c = connect()
    try:
        q = c.cursor()
        r = _quiz(q, aid)
    finally:
        c.rollback()
        c.close()
    if not r:
        raise SystemExit('nenhum quiz ligado a esta tarefa')
    qid, status, slug, titulo, estrutura = r
    print(f'Quiz "{titulo}" · status {status} · slug {slug} · id {qid}')
    print(json.dumps(estrutura, ensure_ascii=False, indent=1) if estrutura else '(sem estrutura ainda)')


def salvar(aid, bruto):
    try:
        e = json.loads(bruto)
    except json.JSONDecodeError as erro:
        raise SystemExit(f'JSON inválido: {erro}')
    erros = validar(e)
    if erros:
        raise SystemExit('Corrija e salve de novo:\n- ' + '\n- '.join(erros))
    c = connect()
    try:
        q = c.cursor()
        r = _quiz(q, aid)
        if not r:
            raise SystemExit('nenhum quiz ligado a esta tarefa')
        qid, status = r[0], r[1]
        if status in ('esboco', 'cancelado'):
            raise SystemExit(f'o quiz está em "{status}": a estrutura só entra depois do esboço aprovado')
        novo = 'revisar' if status == 'criando' else status
        q.execute("UPDATE quizzes SET estrutura = %s::jsonb, status = %s WHERE id = %s",
                  (json.dumps(e, ensure_ascii=False), novo, qid))
        if status == 'criando':
            q.execute("""UPDATE atividades SET situacao = 'aguardando_aprovacao', progresso = 100,
                           observacao = %s WHERE id = %s""",
                      (f'Quiz criado: {len(e["perguntas"])} perguntas e {len(e["perfis"])} perfis. Teste e aprove para publicar.', aid))
        c.commit()
    finally:
        c.close()
    print('SALVO', qid, novo)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == 'ver':
        ver(a[1])
    elif len(a) >= 2 and a[0] == 'salvar':
        salvar(a[1], sys.stdin.read())
    else:
        print(__doc__)
        sys.exit(1)
