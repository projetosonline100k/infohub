"""Teste de ponta a ponta do fluxo Instalivros → Vertical do Davi (25/10/2026), com dados de TESTE
que são apagados no fim (só os ids criados aqui; nada real é mexido):

 1. card de teste no Instalivros sai de "Criando roteiro" para Gravação → o banco cria a tarefa do Junior;
    no mesmo instante ela passa para "andamento" para o ouvinte não pegar (quem adapta aqui é o teste);
 2. adaptacao.py contexto/entregar → card "Aguardando aprovação" na Vertical do Davi, etiqueta Instalivros;
 3. pedir ajuste (igual ao botão do app) → nova versão no mesmo card, a anterior guardada na tarefa;
 4. voltar o original e marcar pronto de novo → não duplica;
 5. aprovar → Gravação.

    python3 scripts/teste-adaptacao-instalivros.py
"""
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

INSTALIVROS = 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3'
DAVI = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
ORIGINAL = ('<p>[TESTE] 3 livros que treinam o seu foco</p><p>O livro Trabalho Focado mostra que a atenção é treinável.</p>'
            '<p>Segue o Instalivros para mais livros assim.</p>')
ADAPTADO = ('[TESTE] 3 livros que treinam o seu foco\n\nEu demorei para entender que foco não é dom: é treino.\n\n'
            'O livro Trabalho Focado mostra que a atenção é treinável.\n\nEu me chamo Davi Queiroz e ajudo pessoas que pensam demais'
            ' a pararem de sabotar o próprio potencial, por isso eu te convido a me seguir.')


def adaptacao(*args, entrada=None):
    r = subprocess.run([sys.executable, str(RAIZ / 'scripts/empresa/adaptacao.py'), *args], input=entrada,
                       capture_output=True, text=True, cwd=RAIZ)
    if r.returncode != 0:
        raise SystemExit(f'adaptacao.py {args[0]} falhou: {r.stderr or r.stdout}')
    return r.stdout


def um(q, sql, args=()):
    q.execute(sql, args)
    return q.fetchone()


c = connect()
q = c.cursor()
criados = {'videos': [], 'tarefas': []}
try:
    vid = um(q, """INSERT INTO videos_vertical (cliente_id, user_id, titulo, status, ordem, roteiro)
                   SELECT id, user_id, '[TESTE] adaptação Instalivros', 'roteiro', 999, %s FROM clientes WHERE id = %s RETURNING id""",
             (ORIGINAL, INSTALIVROS))[0]
    criados['videos'].append(vid)
    q.execute("UPDATE videos_vertical SET status = 'gravacao' WHERE id = %s", (vid,))
    t1 = um(q, "UPDATE atividades SET situacao = 'andamento' WHERE descricao LIKE %s RETURNING id, cliente_id", (f'ADAPTAR:{vid}%',))
    assert t1, 'o gatilho não criou a tarefa'
    criados['tarefas'].append(t1[0])
    c.commit()
    assert str(t1[1]) == DAVI, 'tarefa fora do projeto Davi Queiroz'
    print('1. pronto no Instalivros → tarefa do Junior criada', t1[0])

    ctx = adaptacao('contexto', str(t1[0]))
    assert 'Segue o Instalivros' in ctx and 'CÉREBRO DO DAVI' in ctx and 'NUNCA invente' in ctx, ctx[:500]
    print(adaptacao('entregar', str(t1[0]), '[TESTE] 3 livros que treinam o seu foco', entrada=ADAPTADO).strip())
    card = um(q, """SELECT id, status, origem_plataforma, roteiro FROM videos_vertical WHERE cliente_id = %s AND ideia_origem_id = %s""", (DAVI, vid))
    c.rollback()
    criados['videos'].insert(0, card[0])
    assert card[1] == 'aprovacao' and card[2] == 'instalivros', card
    assert um(q, 'SELECT concluida FROM atividades WHERE id = %s', (t1[0],))[0], 'tarefa não concluída'
    c.rollback()
    print('2. versão adaptada na Vertical do Davi, aguardando aprovação, etiqueta Instalivros:', card[0])

    # Pedir ajuste: o mesmo insert do botão (AdaptacoesInstalivros.tsx), já em andamento.
    t2 = um(q, """INSERT INTO atividades (titulo, cliente_id, user_id, data_atividade, status, concluida, prioridade, ordem,
                                         responsavel_id, setor_id, situacao, tipo, video_vertical_id, descricao)
                  SELECT 'Ajustar adaptação: teste', a.cliente_id, a.user_id, current_date, 'backlog', false, 'media', 0,
                         a.responsavel_id, a.setor_id, 'andamento', 'copy', %s, %s
                    FROM atividades a WHERE a.id = %s RETURNING id""",
            (card[0], f'ADAPTAR:{vid}:{card[0]}\n--- Ajuste pedido pelo Davi ---\nDeixe a segunda linha mais forte.\n'
                      f'--- Versão anterior (guardada) ---\n{card[3]}', t1[0]))
    criados['tarefas'].append(t2[0])
    c.commit()
    ctx = adaptacao('contexto', str(t2[0]))
    assert 'Deixe a segunda linha mais forte' in ctx and 'VERSÃO ANTERIOR' in ctx, ctx[-800:]
    print(adaptacao('entregar', str(t2[0]), '[TESTE] 3 livros que treinam o seu foco',
                    entrada=ADAPTADO.replace('Eu demorei para entender', 'Ninguém me contou')).strip())
    n, rot, st = um(q, """SELECT count(*), max(roteiro), max(status) FROM videos_vertical WHERE cliente_id = %s AND ideia_origem_id = %s""", (DAVI, vid))
    c.rollback()
    assert n == 1 and 'Ninguém me contou' in rot and st == 'aprovacao', (n, st)
    print('3. ajuste → nova versão no mesmo card (a anterior guardada na tarefa do ajuste)')

    q.execute("UPDATE videos_vertical SET status = 'roteiro' WHERE id = %s", (vid,))
    q.execute("UPDATE videos_vertical SET status = 'gravacao' WHERE id = %s", (vid,))
    n = um(q, "SELECT count(*) FROM atividades WHERE descricao LIKE %s", (f'ADAPTAR:{vid}%',))[0]
    c.commit()
    assert n == 2, f'duplicou: {n} tarefas'   # a 1ª + a do ajuste
    print('4. marcar pronto de novo não cria outra adaptação')

    q.execute("UPDATE videos_vertical SET status = 'gravacao' WHERE id = %s RETURNING status", (card[0],))
    c.commit()
    print('5. aprovar → Gravação')
    print('TUDO CERTO')
finally:
    c.rollback()
    for t in criados['tarefas']:
        q.execute('DELETE FROM atividades WHERE id = %s', (t,))
    for v in criados['videos']:
        q.execute('DELETE FROM videos_vertical WHERE id = %s', (v,))
    c.commit()
    c.close()
    print('testes apagados:', len(criados['tarefas']), 'tarefa(s) e', len(criados['videos']), 'card(s)')
