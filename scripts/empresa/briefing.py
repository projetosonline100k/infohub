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

# Funcionários IA que fazem a tarefa sozinhos depois do briefing
# (scripts/empresa/execucao.py). Roy, Danilo e Dalila têm o próprio fluxo.
EXECUTORES = {'ítalo', 'gabriel', 'roy'}  # Roy: só página e quiz por aqui (carrossel é com o serviço dele)
TIPOS = {'edicao', 'carrossel', 'programacao', 'copy', 'pagina', 'metricas', 'gravacao'}
CONSIGO = {'sim', 'em_parte', 'nao'}


def slug(nome):
    s = unicodedata.normalize('NFD', nome).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def manual_do(nome):
    achados = sorted((RAIZ / 'docs/agentes').glob(f'{slug(nome)}-*.md')) + sorted((RAIZ / 'docs/agentes').glob(f'{slug(nome)}.md'))
    return achados[0] if achados else None


def pegar(ignorar=()):
    """Marca as mensagens 'enviada' como 'lida' e devolve os briefings que têm mensagem nova
    (menos os de `ignorar`, que já estão sendo atendidos: a mensagem nova espera a vez deles)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.briefing_mensagens SET status = 'lida'
                      WHERE status = 'enviada' AND NOT (briefing_id = ANY(%s::uuid[])) RETURNING briefing_id""", (list(ignorar),))
        ids = sorted({str(r[0]) for r in q.fetchall()})
        # Revisão: o "fazendo agora" da rodada anterior sai antes da nova resposta.
        if ids:
            q.execute("UPDATE public.briefings SET proposta = NULL WHERE status = 'revisando' AND id = ANY(%s::uuid[])", (ids,))
        c.commit()
        return ids
    finally:
        c.close()


def reenfileirar():
    """Ao ligar o ouvinte: mensagem 'lida' sem resposta é de um atendimento que caiu no meio. Volta pra fila."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.briefing_mensagens SET status = 'enviada' WHERE status = 'lida' RETURNING briefing_id")
        n = len(q.fetchall())
        c.commit()
        return n
    finally:
        c.close()


def contexto(bid, como=None):
    c = connect()
    try:
        q = c.cursor()
        q.execute('SET TRANSACTION READ ONLY')
        q.execute("""SELECT b.status, b.proposta, b.cliente_id, cl.nome_especialista, cl.nicho,
                            m.nome, m.funcao, m.responsabilidades, m.eh_ia, s.nome, b.atividade_id
                       FROM briefings b JOIN clientes cl ON cl.id = b.cliente_id
                       JOIN membros m ON m.id = b.membro_id LEFT JOIN setores s ON s.id = m.setor_id
                      WHERE b.id = %s""", (bid,))
        r = q.fetchone()
        if not r:
            raise SystemExit('briefing não encontrado')
        status, proposta, cliente_id, especialista, nicho, nome, funcao, resp, eh_ia, setor, atividade_id = r
        entrega = None
        quiz = None
        edicao = None
        if status == 'revisando' and atividade_id:
            q.execute("""SELECT a.titulo, a.situacao, d.id, d.titulo FROM atividades a
                           LEFT JOIN LATERAL (SELECT id, titulo FROM documentos WHERE atividade_id = a.id AND deleted_at IS NULL
                                               ORDER BY updated_at DESC LIMIT 1) d ON true WHERE a.id = %s""", (atividade_id,))
            entrega = q.fetchone()
            q.execute("SELECT status FROM quizzes WHERE atividade_id = %s ORDER BY criado_em DESC LIMIT 1", (atividade_id,))
            quiz = q.fetchone()
            q.execute("""SELECT id, titulo, status, versao FROM edicoes_video WHERE atividade_id = %s
                          ORDER BY atualizado_em DESC LIMIT 1""", (atividade_id,))
            edicao = q.fetchone()
        q.execute("""SELECT nome_produto, status FROM produtos_cliente WHERE cliente_id = %s ORDER BY status, nome_produto""", (cliente_id,))
        produtos = q.fetchall()
        q.execute("""SELECT bm.papel, bm.texto, bm.criada_em, mm.nome FROM briefing_mensagens bm
                       LEFT JOIN membros mm ON mm.id = bm.membro_id WHERE bm.briefing_id = %s ORDER BY bm.criada_em""", (bid,))
        msgs = q.fetchall()
        q.execute("""SELECT m.nome, m.funcao FROM briefings b JOIN membros m ON m.id = ANY(b.participantes) WHERE b.id = %s""", (bid,))
        participantes = q.fetchall()
        eu = None
        if como:
            q.execute("""SELECT m.nome, m.funcao, m.responsabilidades, s.nome FROM briefings b JOIN membros m ON m.cliente_id = b.cliente_id
                          LEFT JOIN setores s ON s.id = m.setor_id WHERE b.id = %s AND lower(m.nome) = lower(%s) LIMIT 1""", (bid, como))
            eu = q.fetchone()
        # Memória: os últimos pedidos já combinados com este funcionário (e como terminaram).
        q.execute("""SELECT b.atualizado_em, b.proposta->>'titulo', a.situacao, a.concluida, a.deleted_at IS NOT NULL
                       FROM briefings b LEFT JOIN atividades a ON a.id = b.atividade_id
                      WHERE b.membro_id = (SELECT membro_id FROM briefings WHERE id = %s)
                        AND b.id <> %s AND b.status = 'confirmado'
                      ORDER BY b.atualizado_em DESC LIMIT 6""", (bid, bid))
        anteriores = q.fetchall()
    finally:
        c.rollback()
        c.close()
    dono = nome
    if eu:
        nome, funcao, resp, setor = eu
        print(f'VOCÊ É {nome} ({funcao or "-"}), CHAMADO PARA ESTA CONVERSA. A conversa é do {dono}; responda pela sua área.')
    manual = manual_do(nome)
    print(f'Projeto: {especialista} (nicho: {nicho or "-"}) · cliente_id {cliente_id}')
    print('Produtos: ' + (', '.join(f'{p} ({s})' for p, s in produtos) or 'nenhum'))
    print(f'Funcionário: {nome} · {funcao or "-"} · setor {setor or "-"} · {"IA" if eh_ia else "PESSOA (você ajuda a detalhar o pedido para ela)"}')
    print('Responsabilidades: ' + ', '.join(resp or []))
    print(f'Manual: {manual.relative_to(RAIZ) if manual else "(não tem)"}')
    print(f'Inteligência (os "SIGA SEMPRE" do topo são o que o Davi já te ensinou): python3 scripts/inteligencia/ler.py --cliente {cliente_id} --agente "{nome.lower()}"')
    print(f'Aprendeu algo que vale para as próximas vezes? python3 scripts/inteligencia/aprender.py anotar --cliente {cliente_id} --agente "{nome.lower()}" "<a regra>"')
    if anteriores:
        print('Pedidos anteriores que vocês já combinaram:')
        for quando, titulo, situacao, concluida, cancelada in anteriores:
            fim = 'cancelado' if cancelada else 'concluído' if concluida else (situacao or 'na fila')
            print(f'  - {quando:%d/%m}: {titulo or "(sem título)"} ({fim})')
    if eh_ia and nome.lower() in EXECUTORES:
        print('Depois que o Davi confirmar: você começa SOZINHO e entrega um documento para ele aprovar. Diga isso a ele.')
    print(f'Status do briefing: {status}')
    if entrega:
        t_tit, t_sit, d_id, d_tit = entrega
        print(f'CONVERSA SOBRE A ENTREGA da tarefa "{t_tit}" (id {atividade_id}, situação {t_sit}).')
        print(f'Documento entregue: "{d_tit}" ({d_id}). Leia: python3 scripts/consulta.py "select conteudo from documentos where id = \'{d_id}\'"' if d_id else 'Documento entregue: (não achei)')
        if edicao:
            e_id, e_tit, e_st, e_v = edicao
            print(f'É uma EDIÇÃO DE VÍDEO: "{e_tit}" (edição {e_id}, versão {e_v}, status {e_st}). O Davi está no EDITOR do Danilo, '
                  f'vendo a edição e conversando com você. Pasta: ~/.infopro-hub/danilo/edicoes/{e_id}/ (projeto.json, escolhas.json). '
                  'Manual: docs/agentes/danilo-editor.md (Parte B). Ferramentas: python3 scripts/danilo/danilo.py texto|ouvir|quadros|pintura|versao|conferir. '
                  'Para mudar a edição: edite o projeto.json DIRETO (tempos no bruto; ele já tem o que o Davi mexeu no editor). '
                  'NÃO rode o montar (ele refaz o projeto do escolhas.json e apaga os ajustes do Davi). '
                  f'Depois rode `danilo.py versao {e_id}` (o servidor gera a nova versão e o editor recarrega sozinho) e confira com '
                  f'`danilo.py conferir {e_id} --so-olhar`. NÃO use o entregar e NÃO aprove (quem aprova é o Davi, no botão do editor). '
                  'O que o Davi corrigir ou elogiar e valer para os próximos vídeos, anote nos aprendizados (aprender.py, agente "danilo").')
        if quiz:
            print(f'É um QUIZ (docs/QUIZ.md), status {quiz[0]}. '
                  + ('O Davi está revisando o ESBOÇO (o documento acima): ajuste o documento com o entregar; quem aprova é ele.' if quiz[0] == 'esboco'
                     else (f'O quiz já está PUBLICADO (status {quiz[0]}): o que você salvar muda o link que o público está usando NA HORA. Mudança pequena e clara: faça. Mudança grande (trocar perguntas, perfis, oferta): confirme com o Davi antes. Veja: python3 scripts/quiz/quiz.py ver {atividade_id} · ajuste: python3 scripts/quiz/quiz.py salvar {atividade_id} (JSON inteiro). Não use o entregar.'
                           if quiz[0] in ('publicado', 'pausado') else
                           f'O Davi está testando o QUIZ criado. Veja: python3 scripts/quiz/quiz.py ver {atividade_id} · ajuste: python3 scripts/quiz/quiz.py salvar {atividade_id} (JSON inteiro). Não use o entregar.')))
    if proposta:
        print('Proposta já gravada: ' + json.dumps(proposta, ensure_ascii=False))
    if participantes:
        print(f'Conversa em GRUPO. Dono: {dono}. Também na conversa: ' + ', '.join(f'{n} ({f or "-"})' for n, f in participantes))
    print(f'Chamar um colega pra conversa: python3 scripts/empresa/briefing.py convidar {bid} "<nome>" (ele responde logo depois)')
    print('\nConversa:')
    for papel, texto, quando, quem in msgs:
        print(f'[{quando:%d/%m %H:%M}] {"Davi" if papel == "davi" else (quem or dono)}: {texto}')


def responder(bid, texto, como=None):
    """Grava a fala do funcionário (o dono da conversa, ou `como`, um participante). Em conversa
    em grupo, quem fecha a rodada (marca a mensagem do Davi como respondida) é o ouvinte."""
    texto = texto.strip()
    if not texto:
        raise SystemExit('resposta vazia')
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT coalesce((SELECT m.id FROM membros m WHERE m.cliente_id = b.cliente_id AND lower(m.nome) = lower(%s) LIMIT 1), b.membro_id),
                            cardinality(b.participantes) FROM briefings b WHERE b.id = %s""", (como or '', bid))
        quem, n_part = q.fetchone()
        q.execute("INSERT INTO public.briefing_mensagens(briefing_id, papel, texto, membro_id) VALUES (%s, 'funcionario', %s, %s)", (bid, texto, quem))
        if not n_part:
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


def finalizar(bid):
    """Fim da rodada de uma conversa em grupo: a mensagem do Davi fica respondida."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.briefing_mensagens SET status = 'respondida' WHERE briefing_id = %s AND status IN ('enviada', 'lida')", (bid,))
        c.commit()
    finally:
        c.close()


def convidar(bid, nome):
    """Chama um colega IA do mesmo projeto pra conversa (ele responde logo depois de quem chamou)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.briefings b SET participantes = array_append(b.participantes, m.id)
                       FROM membros m WHERE b.id = %s AND m.cliente_id = b.cliente_id AND lower(m.nome) = lower(%s)
                        AND m.eh_ia AND m.ativo AND m.id <> b.membro_id AND NOT (m.id = ANY(b.participantes))
                     RETURNING m.nome""", (bid, nome.strip()))
        r = q.fetchone()
        c.commit()
    finally:
        c.close()
    print(f'CHAMADO {r[0]}' if r else 'nada a fazer (não achei esse funcionário IA no projeto, ou ele já está na conversa)')


def participantes(bid):
    """[(id, nome)] de quem foi chamado pra conversa (sem o dono), na ordem em que entrou."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT m.id, m.nome FROM briefings b, unnest(b.participantes) WITH ORDINALITY p(id, k)
                       JOIN membros m ON m.id = p.id WHERE b.id = %s ORDER BY p.k""", (bid,))
        return [(str(i), n) for i, n in q.fetchall()]
    finally:
        c.close()


def respondeu(bid, nome, desde):
    """`nome` (ou o dono, se None) falou na conversa depois de `desde`?"""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""SELECT count(*) FROM briefing_mensagens bm JOIN briefings b ON b.id = bm.briefing_id
                       JOIN membros m ON m.id = coalesce(bm.membro_id, b.membro_id)
                      WHERE bm.briefing_id = %s AND bm.papel = 'funcionario' AND bm.criada_em >= %s
                        AND (CASE WHEN %s::text IS NULL THEN m.id = b.membro_id ELSE lower(m.nome) = lower(%s::text) END)""",
                  (bid, desde, nome, nome))
        return q.fetchone()[0] > 0
    finally:
        c.close()


def agora(bid, texto):
    """Revisão: o que o funcionário está fazendo agora (aparece no chat enquanto o Davi espera)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE public.briefings SET proposta = jsonb_build_object('agora', %s::text) WHERE id = %s AND status = 'revisando'",
                  (texto.strip()[:120], bid))
        c.commit()
    finally:
        c.close()
    print('OK')


def status(bid):
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT status FROM public.briefings WHERE id = %s", (bid,))
        r = q.fetchone()
        return r[0] if r else None
    finally:
        c.close()


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
        contexto(args[1], args[3] if len(args) > 3 and args[2] == '--como' else None)
    elif cmd == 'responder':
        responder(args[1], sys.stdin.read(), args[3] if len(args) > 3 and args[2] == '--como' else None)
    elif cmd == 'convidar':
        convidar(args[1], args[2])
    elif cmd == 'propor':
        propor(args[1], sys.stdin.read())
    elif cmd == 'agora':
        agora(args[1], args[2])
    else:
        print(__doc__)
        sys.exit(1)
