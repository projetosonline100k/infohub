"""Quiz do Infopro (Conteúdo → Quiz). Usado pelo Roy na etapa 2 (criar) e nos ajustes.
Formato e fluxo: docs/QUIZ.md.

  python3 scripts/quiz/quiz.py ver <atividade_id>              → status, slug e a estrutura atual
  python3 scripts/quiz/quiz.py de-esboco <atividade_id>         → esboço aprovado de OUTRO funcionário (ex.: Ítalo)
                                                                   vira tarefa do Roy já na etapa 2 (criar o quiz)
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
    telas = e.get('telas') or []
    if not isinstance(telas, list):
        erros.append('telas: tem que ser uma lista')
        telas = []
    for k, t in enumerate(telas, 1):
        if not isinstance(t, dict) or t.get('tipo') not in ('respiro', 'especialista', 'carregando', 'resultado'):
            erros.append(f'tela {k}: tipo tem que ser respiro, especialista, carregando ou resultado')
        elif t.get('depois_de') != 'intro' and t.get('depois_de') not in vistos:
            erros.append(f'tela {k}: depois_de "{t.get("depois_de")}" não é "intro" nem id de pergunta')
        elif not t.get('id'):
            t['id'] = f't{k}'
    for b in ((e.get('resultado') or {}).get('grafico') or {}).get('barras', []):
        if any(pid not in ids for pid in b.get('perfis', [])):
            erros.append(f'resultado.grafico: barra "{b.get("rotulo")}" com perfil que não existe')
    cap = e.get('captura') or {}
    if cap and any(c not in ('nome', 'email', 'whatsapp') for c in cap.get('pedir', [])):
        erros.append('captura.pedir: só nome, email e whatsapp')
    if cap.get('depois_de') and cap['depois_de'] not in vistos | {t.get('id') for t in telas if isinstance(t, dict)}:
        erros.append(f'captura.depois_de "{cap["depois_de"]}" não é id de pergunta nem de tela')
    for k, item in enumerate((e.get('oferta') or {}).get('faq') or [], 1):
        if not isinstance(item, dict) or not str(item.get('pergunta', '')).strip() or not str(item.get('resposta', '')).strip():
            erros.append(f'oferta.faq {k}: precisa de pergunta e resposta')
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


def de_esboco(origem):
    """O Davi aprovou um esboço de quiz feito por outro funcionário: nasce a tarefa do
    Roy do mesmo projeto e o quiz já em 'criando' (o esboço vai anexado com 📎)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT cliente_id, user_id, titulo, pasta_id, data_vencimento FROM atividades WHERE id = %s", (origem,))
        r = q.fetchone()
        if not r:
            raise SystemExit('tarefa de origem não encontrada')
        cliente_id, dono, titulo, pasta, prazo = r
        q.execute("SELECT 1 FROM quizzes WHERE atividade_id IN (SELECT id FROM atividades WHERE descricao LIKE %s) AND status <> 'cancelado'",
                  (f'%(origem {origem})%',))
        if q.fetchone():
            raise SystemExit('este esboço já foi passado para o Roy')
        q.execute("""SELECT id, titulo FROM documentos WHERE atividade_id = %s AND deleted_at IS NULL
                      ORDER BY updated_at DESC LIMIT 1""", (origem,))
        doc = q.fetchone()
        if not doc:
            raise SystemExit('a tarefa de origem não tem documento de esboço')
        q.execute("""SELECT id, nome FROM membros WHERE cliente_id = %s AND eh_ia AND ativo AND lower(nome) = 'roy' LIMIT 1""", (cliente_id,))
        roy = q.fetchone()
        if not roy:
            raise SystemExit('este projeto não tem o Roy (IA) ativo')
        q.execute("""SELECT status_key FROM colunas_atividade WHERE cliente_id = %s AND NOT eh_conclusao ORDER BY ordem LIMIT 1""", (cliente_id,))
        col = q.fetchone()
        nome = re.sub(r'^\s*(esbo[cç]o d[oa]s?\s*)', '', titulo, flags=re.I).strip() or titulo
        nome = nome[:1].upper() + nome[1:]
        descricao = (f'Criar no Infopro o quiz do esboço APROVADO pelo Davi (origem {origem}).\n'
                     f'O esboço já está pronto e aprovado: não refaça o esboço, vá direto para a etapa 2 (docs/QUIZ.md) e siga o que ele diz '
                     f'(nome, palavras, perguntas, opções, perfis e ponte para a oferta).\n\n'
                     f'📎 Para ler: "{doc[1]}" (documento {doc[0]})')
        q.execute("""INSERT INTO atividades (cliente_id, user_id, titulo, status, pasta_id, responsavel_id, situacao, tipo, descricao, data_vencimento)
                     VALUES (%s, %s, %s, %s, %s, %s, 'fila', 'quiz', %s, %s) RETURNING id""",
                  (cliente_id, dono, f'Criar o quiz: {nome}'[:200], col[0] if col else 'backlog', pasta, roy[0], descricao, prazo))
        aid = q.fetchone()[0]
        q.execute("""INSERT INTO quizzes (cliente_id, user_id, atividade_id, titulo, pedido, status)
                     VALUES (%s, %s, %s, %s, %s, 'criando') RETURNING id""",
                  (cliente_id, dono, aid, nome[:150], f'Esboço aprovado: {doc[1]}'))
        qid = q.fetchone()[0]
        c.commit()
    finally:
        c.close()
    print('PASSADO', aid, qid)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == 'ver':
        ver(a[1])
    elif len(a) >= 2 and a[0] == 'de-esboco':
        de_esboco(a[1])
    elif len(a) >= 2 and a[0] == 'salvar':
        salvar(a[1], sys.stdin.read())
    else:
        print(__doc__)
        sys.exit(1)
