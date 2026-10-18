"""Execução automática das tarefas confirmadas por briefing (pedido do Davi,
14/10/2026: "toda vez que eu confirmar uma tarefa, ele começa sozinho").

O ouvinte do Atlas (scripts/jarvis-ouvinte.py, linha "execucao") pega a
tarefa na fila de qualquer funcionário IA (16/10: ninguém fica parado), põe em
andamento e chama o Claude no papel dele. Ele entrega um documento no projeto
e a tarefa vai para "aguardando aprovação" do Davi.

  python3 scripts/empresa/execucao.py contexto <atividade_id>
  python3 scripts/empresa/execucao.py entregar <atividade_id> "<título do documento>" "<resumo de 1 linha>" <<'FIM'
  <html do documento: h2, h3, p, ul, ol, li, strong, em, a, blockquote>
  FIM
  python3 scripts/empresa/execucao.py progresso <atividade_id> <0-100> "<o que está fazendo agora>" [minutos que ainda faltam]
  python3 scripts/empresa/execucao.py erro <atividade_id> "<motivo>"
  python3 scripts/empresa/execucao.py pegar        → (ouvinte) próxima tarefa, já em andamento

Só escreve em atividades (situação/observação) e documentos."""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
sys.path.insert(0, str(RAIZ / 'scripts' / 'empresa'))
from migration_db import connect  # noqa: E402
from briefing import EXECUTORES, manual_do  # noqa: E402
AJUSTE = '--- Ajuste pedido pelo Davi'   # mesmo texto de src/lib/empresa/entregas.ts
TAGS = {'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br'}


DAVI = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'


def _quem_faz(a):
    """Filtro SQL (alias da tarefa = a): tarefas que o ouvinte executa.
    16/10, Davi: "independente das atividades, cada funcionário que tenha algo para fazer
    esteja fazendo algo" — vale para TODO funcionário IA (Dalila, Danilo… também), não só
    os executores. Ficam de fora só as que têm dono próprio ou esperam o Davi."""
    return f"""m.eh_ia AND m.ativo AND lower(m.nome) NOT IN ('atlas', 'jarvis')
        -- Danilo do projeto Davi: o serviço dele (scripts/danilo/servico.py) pega tudo dele;
        -- edição de vídeo nos outros projetos ainda não tem editor.
        AND NOT (lower(m.nome) = 'danilo' AND ({a}.cliente_id = '{DAVI}' OR coalesce({a}.tipo, '') = 'edicao'))
        AND NOT EXISTS (SELECT 1 FROM public.edicoes_video x WHERE x.atividade_id = {a}.id)
        -- Programar/publicar post: espera o Davi escolher a data (a nuvem da Dalila publica).
        AND NOT EXISTS (SELECT 1 FROM public.carrosseis x WHERE x.atividade_id = {a}.id OR x.tarefa_data_id = {a}.id)
        AND NOT EXISTS (SELECT 1 FROM public.reels x WHERE x.atividade_id = {a}.id OR x.tarefa_data_id = {a}.id)
        AND NOT ({a}.titulo ILIKE 'Programar carrossel:%%' OR {a}.titulo ILIKE 'Programar reel:%%')
        -- Carrossel do Roy no projeto Davi Queiroz é com o serviço dele (scripts/roy/servico.py).
        AND NOT (lower(m.nome) = 'roy' AND coalesce({a}.tipo, '') NOT IN ('pagina', 'quiz', 'programacao')
                 AND {a}.cliente_id = '{DAVI}')"""


def eh_sistema(aid):
    """Tarefa que muda o Infopro (tipo programacao fora de post): é feita num worktree, como o Pedro."""
    return situacao(aid, campo='tipo') == 'programacao'


def pegar(ignorar=(), ocupados=(), com_membro=False, sistema=False):
    """Põe em andamento a tarefa mais antiga confirmada por briefing e devolve o id.
    ocupados: funcionários já trabalhando (cada um faz uma por vez; os outros não esperam,
    16/10: "o funcionário não pode ficar parado esperando"). com_membro: devolve (id, membro).
    sistema: quem chama sabe fazer tarefa que muda o sistema num worktree (ouvinte novo)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""
            UPDATE public.atividades a SET situacao = 'andamento', progresso = 5,
                   observacao = CASE WHEN coalesce(a.observacao, '') LIKE '▶️%%' THEN NULL ELSE a.observacao END
             WHERE a.id = (
               SELECT a2.id FROM public.atividades a2
                 JOIN public.membros m ON m.id = a2.responsavel_id
                WHERE a2.deleted_at IS NULL AND NOT a2.concluida AND a2.situacao = 'fila'
                  AND """ + _quem_faz('a2') + ("" if sistema else " AND coalesce(a2.tipo, '') <> 'programacao'") + """
                  -- "Começar agora" (▶️ na observação, botão da fila): tenta de novo mesmo se já falhou.
                  AND (NOT (a2.id = ANY(%s::uuid[])) OR coalesce(a2.observacao, '') LIKE '▶️%%')
                  AND NOT (m.id = ANY(%s::uuid[]))
                ORDER BY a2.created_at LIMIT 1 FOR UPDATE OF a2 SKIP LOCKED)
            RETURNING a.id, a.responsavel_id""", (list(ignorar), list(ocupados)))
        r = q.fetchone()
        c.commit()
        if com_membro:
            return (str(r[0]), str(r[1])) if r else (None, None)
        return str(r[0]) if r else None
    finally:
        c.close()


def reenfileirar():
    """Ao ligar o ouvinte: tarefa que ele estava fazendo quando caiu volta pra fila (senão
    ficaria "em andamento" pra sempre). Só as do fluxo de execução — não mexe no carrossel do
    serviço do Roy, na edição do Danilo nem no post programado da Dalila."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE public.atividades a SET situacao = 'fila', progresso = NULL,
                            observacao = 'Retomada: o ouvinte reiniciou no meio do trabalho.'
                      FROM public.membros m
                     WHERE m.id = a.responsavel_id AND a.situacao = 'andamento' AND NOT a.concluida AND a.deleted_at IS NULL
                       AND """ + _quem_faz('a') + """
                    RETURNING a.id""")
        n = len(q.fetchall())
        c.commit()
        return n
    finally:
        c.close()


def contexto(aid):
    c = connect()
    try:
        q = c.cursor()
        q.execute('SET TRANSACTION READ ONLY')
        q.execute("""SELECT a.titulo, a.descricao, a.data_vencimento, a.tipo, a.cliente_id, cl.nome_especialista, cl.nicho,
                            m.nome, m.funcao, m.manual
                       FROM atividades a JOIN clientes cl ON cl.id = a.cliente_id JOIN membros m ON m.id = a.responsavel_id
                      WHERE a.id = %s""", (aid,))
        r = q.fetchone()
        if not r:
            raise SystemExit('tarefa não encontrada')
        titulo, descricao, prazo, tipo, cliente_id, especialista, nicho, nome, funcao, manual_cadastro = r
        q.execute("""SELECT id, titulo, updated_at FROM documentos WHERE cliente_id = %s AND deleted_at IS NULL
                      ORDER BY updated_at DESC LIMIT 15""", (cliente_id,))
        docs = q.fetchall()
        q.execute("""SELECT id, titulo FROM documentos WHERE atividade_id = %s AND deleted_at IS NULL
                      ORDER BY updated_at DESC LIMIT 1""", (aid,))
        anterior = q.fetchone()
        q.execute("SELECT id, status, slug FROM quizzes WHERE atividade_id = %s ORDER BY criado_em DESC LIMIT 1", (aid,))
        quiz = q.fetchone()
    finally:
        c.rollback()
        c.close()
    manual = manual_do(nome)
    print(f'Tarefa: {titulo}  (id {aid})')
    print(f'Prazo: {prazo or "sem prazo"} · tipo: {tipo or "-"}')
    print(f'Projeto: {especialista} (nicho: {nicho or "-"}) · cliente_id {cliente_id}')
    print(f'Você: {nome} · {funcao or "-"} · manual: {manual.relative_to(RAIZ) if manual else "(não tem)"}')
    if manual_cadastro:
        print('Seu manual (do cadastro no app, siga):\n' + manual_cadastro.strip())
    print(f'Inteligência: python3 scripts/inteligencia/ler.py --cliente {cliente_id} --agente "{nome.lower()}" --saida <pasta temporária>')
    print('Documentos recentes do projeto (ler com scripts/consulta.py se precisar):')
    for d_id, d_tit, d_quando in docs:
        print(f'  - {d_tit} · {d_quando:%d/%m} · {d_id}')
    print('\nO combinado (briefing confirmado):\n' + (descricao or '(sem descrição)'))
    if tipo == 'quiz':
        print('\nQUIZ (fluxo e formato em docs/QUIZ.md, leia antes):')
        if quiz and quiz[1] == 'criando':
            esboco = f'"{anterior[1]}", documento {anterior[0]}' if anterior else 'o documento anexado com 📎 no combinado abaixo'
            print(f'ETAPA 2 de 2: CRIAR O QUIZ. O Davi aprovou o esboço ({esboco}; leia com scripts/consulta.py). Monte a estrutura JSON do docs/QUIZ.md seguindo o esboço'
                  f' e a conversa, e salve (isso manda o quiz para o Davi testar e aprovar; NÃO use o entregar):\n'
                  f"  python3 scripts/quiz/quiz.py salvar {aid} <<'FIM'\n  {{...json...}}\n  FIM")
        else:
            print('ETAPA 1 de 2: ESBOÇO. Entregue um DOCUMENTO com o esboço (nome do quiz e promessa, as partes, TODAS as perguntas'
                  ' com as opções, os perfis de resultado e a ponte para a oferta) com o entregar abaixo. Depois que o Davi aprovar o esboço,'
                  ' a tarefa volta pra você na etapa 2 (criar o quiz no Infopro).')
    if (descricao or '').startswith('ESTEIRA:'):
        pid = descricao[len('ESTEIRA:'):].split(':')[0]
        print('\nÉ uma PEÇA DA ESTEIRA do seu escritório (cada um faz a sua etapa e passa adiante sozinho).'
              ' NÃO use o entregar nem crie documento. Veja a peça, o que as etapas anteriores fizeram e as notas:\n'
              f'  python3 scripts/empresa/esteira.py contexto {pid}\n'
              'Siga o SEU manual (acima) e a inteligência (os "SIGA SEMPRE" do ler.py: são as instruções do Davi no chat da esteira).'
              f" Faça a sua parte e passe adiante:\n  python3 scripts/empresa/esteira.py entregar {pid} <<'FIM'\n  <o seu texto>\n  FIM\n"
              f"Se for a 1ª etapa e a peça for uma IDEIA/pedido (não uma headline pronta), gere EXATAMENTE a quantidade pedida (sem número: 5) e mande:\n"
              f"  python3 scripts/empresa/esteira.py novas {pid} <<'FIM'\n  [\"headline 1\", \"headline 2\"]\n  FIM\n"
              f'Se você é a REVISÃO e o texto não está bom, devolva com o que ajustar: python3 scripts/empresa/esteira.py devolver {pid} "<o que ajustar>"'
              ' (no máximo 2 devoluções; depois disso, ajuste você mesmo e entregue).'
              ' NÃO crie peças novas com o "ideia" aqui: isso só no chat, quando o Davi pedir.'
              '\nROTEIRO e REVISÃO vão em TRECHOS ANOTADOS (o Davi quer ver o que foi pensado e o que mudou):'
              f"\n  python3 scripts/empresa/esteira.py anotado {pid} <<'FIM'\n  [{{\"texto\": \"<trecho do roteiro>\", \"nota\": \"<por que fiz assim: estrutura, gancho, escolha de palavra>\"}}, ...]\n  FIM"
              '\n  - Roteiro: divida em trechos naturais (gancho, cada ponto, fechamento); nota nos trechos com escolha importante (não precisa em todos).'
              '\n  - Revisão: mande os MESMOS trechos do roteiro, na mesma ordem, já revisados; nota SÓ onde mudou, dizendo o que trocou e por quê'
              ' (ex.: "Troquei proteína de primeira por carne de primeira porque fica mais fácil de entender"). O anotado já passa adiante (não use o entregar).')
    if anterior and AJUSTE in (descricao or ''):
        print(f'\n⚠️ É um AJUSTE: o Davi leu a versão anterior e pediu mudanças (o último "{AJUSTE}" acima).'
              f'\nVersão anterior: "{anterior[1]}" ({anterior[0]}). Leia com scripts/consulta.py, faça só o que ele pediu'
              ' sem perder o que estava bom, e entregue de novo (o entregar atualiza o mesmo documento).')


def limpar_html(s):
    s = re.sub(r'(?is)<(script|style|iframe)[^>]*>.*?</\1>', '', s)
    def tag(m):
        nome = m.group(2).lower()
        if nome not in TAGS:
            return ''
        if nome == 'a' and not m.group(1):
            href = re.search(r'href="(https?://[^"]+)"', m.group(0))
            return f'<a href="{href.group(1)}">' if href else '<a>'
        return f'<{m.group(1)}{nome}>'
    return re.sub(r'<(/?)([a-zA-Z0-9]+)[^>]*>', tag, s).strip()


def entregar(aid, titulo, resumo, conteudo):
    html = limpar_html(conteudo)
    if len(re.sub('<[^>]+>', '', html).strip()) < 200:
        raise SystemExit('documento vazio ou curto demais')
    c = connect()
    try:
        q = c.cursor()
        q.execute("SELECT cliente_id, user_id, pasta_id FROM atividades WHERE id = %s", (aid,))
        cliente_id, dono, _ = q.fetchone()
        # Mesma pasta de documentos do último documento do projeto (senão, sem pasta).
        q.execute("""SELECT pasta_id FROM documentos WHERE cliente_id = %s AND deleted_at IS NULL AND pasta_id IS NOT NULL
                      ORDER BY updated_at DESC LIMIT 1""", (cliente_id,))
        pasta = q.fetchone()
        # Ajuste: a nova versão substitui a anterior no mesmo documento.
        q.execute("""UPDATE documentos SET titulo = %s, conteudo = %s, updated_at = now()
                      WHERE id = (SELECT id FROM documentos WHERE atividade_id = %s AND deleted_at IS NULL
                                   ORDER BY updated_at DESC LIMIT 1) RETURNING id""", (titulo.strip()[:150], html, aid))
        r = q.fetchone()
        if not r:
            q.execute("""INSERT INTO documentos (cliente_id, atividade_id, titulo, conteudo, user_id, pasta_id)
                         VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                      (cliente_id, aid, titulo.strip()[:150], html, dono, pasta[0] if pasta else None))
            r = q.fetchone()
        did = r[0]
        # Quiz pedido por conversa (sem passar pela aba Quiz): nasce a linha do quiz junto com o esboço.
        q.execute("""INSERT INTO quizzes (cliente_id, user_id, atividade_id, titulo)
                     SELECT a.cliente_id, a.user_id, a.id, a.titulo FROM atividades a
                      WHERE a.id = %s AND a.tipo = 'quiz' AND NOT EXISTS (SELECT 1 FROM quizzes WHERE atividade_id = a.id)""", (aid,))
        obs = f'Entregue no documento "{titulo.strip()[:150]}". {resumo.strip()[:400]}'
        q.execute("SELECT a.tipo, lower(m.nome) FROM atividades a LEFT JOIN membros m ON m.id = a.responsavel_id WHERE a.id = %s", (aid,))
        tipo, quem = q.fetchone()
        # Estudo (Gabriel) conclui direto. O Pedro, desde 16/10, vai para a revisão do Davi como todo
        # mundo ("a pesquisa que o Pedro fez nem passou para eu revisar"); só o mapeamento de ideias
        # (que já vira cartões no kanban dele) continua concluindo sozinho.
        q.execute("SELECT titulo FROM atividades WHERE id = %s", (aid,))
        titulo_tarefa = (q.fetchone() or [''])[0] or ''
        if tipo == 'estudo' or quem == 'gabriel' or (quem == 'pedro' and titulo_tarefa.lower().startswith('mapear')):
            # Estudo não precisa de aprovação: vai direto pra Fonte de conhecimento e a tarefa conclui.
            q.execute("SELECT status_key FROM colunas_atividade WHERE cliente_id = %s AND eh_conclusao ORDER BY ordem LIMIT 1", (cliente_id,))
            col = q.fetchone()
            q.execute("""UPDATE atividades SET situacao = 'concluida', concluida = true, progresso = 100, observacao = %s,
                           status = coalesce(%s, status) WHERE id = %s""", (obs, col[0] if col else None, aid))
        else:
            q.execute("""UPDATE atividades SET situacao = 'aguardando_aprovacao', progresso = 100, observacao = %s WHERE id = %s""",
                      (obs, aid))
        c.commit()
    finally:
        c.close()
    print('ENTREGUE', did)


def progresso(aid, pct, etapa, falta_min=None):
    """Quanto do trabalho já foi feito (a barra na janela do funcionário), o que está fazendo agora
    e, se souber, quantos minutos acha que ainda faltam (vira a previsão "faltam ~X min")."""
    pct = max(5, min(95, int(pct)))   # 100 só quando entrega
    falta = None
    if falta_min not in (None, ''):
        try:
            falta = max(1, min(600, int(float(falta_min))))
        except ValueError:
            falta = None
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE atividades SET progresso = %s, observacao = %s,
                            previsao_fim = CASE WHEN %s::int IS NULL THEN previsao_fim ELSE now() + make_interval(mins => %s::int) END
                      WHERE id = %s AND situacao = 'andamento'""",
                  (pct, f'Agora: {etapa.strip()[:200]}', falta, falta, aid))
        c.commit()
    finally:
        c.close()
    print('PROGRESSO', pct)


def erro(aid, motivo):
    c = connect()
    try:
        q = c.cursor()
        q.execute("""UPDATE atividades SET situacao = 'fila', progresso = NULL, observacao = %s
                      WHERE id = %s AND situacao = 'andamento'""", (f'⚠️ Não consegui fazer sozinho: {motivo.strip()[:400]}', aid))
        c.commit()
    finally:
        c.close()
    print('ERRO_REGISTRADO')


def nota(aid, texto):
    """Aviso na tarefa sem mudar a situação (ex.: entregue, mas não deu para juntar no sistema)."""
    c = connect()
    try:
        q = c.cursor()
        q.execute("UPDATE atividades SET observacao = %s WHERE id = %s", (texto[:600], aid))
        c.commit()
    finally:
        c.close()


def situacao(aid, campo='situacao'):
    c = connect()
    try:
        q = c.cursor()
        q.execute(f"SELECT {'tipo' if campo == 'tipo' else 'situacao'} FROM atividades WHERE id = %s", (aid,))
        r = q.fetchone()
        return r[0] if r else None
    finally:
        c.close()


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(1)
    if a[0] == 'pegar':
        print(json.dumps(pegar()))
    elif a[0] == 'contexto':
        contexto(a[1])
    elif a[0] == 'entregar':
        entregar(a[1], a[2], a[3] if len(a) > 3 else '', sys.stdin.read())
    elif a[0] == 'progresso':
        progresso(a[1], a[2], a[3] if len(a) > 3 else '', a[4] if len(a) > 4 else None)
    elif a[0] == 'erro':
        erro(a[1], a[2])
    else:
        print(__doc__)
        sys.exit(1)
