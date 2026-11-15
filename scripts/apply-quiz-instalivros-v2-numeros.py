"""Quiz Instalivros V2 (15/11/2026, pedido do Davi no chat do Roy): liga na V2 a roleta, a régua, as barras dos mentores, o depoimento animado, a projeção,
o compromisso com ✓ desenhado e o plano em números (tipos novos do player: docs/QUIZ.md, "Números, projeção e compromisso").
Só mexe no RASCUNHO (`estrutura`) da V2 (nunca na V1) e pode rodar de novo (troca o que já está). Lê a linha com FOR UPDATE e grava de volta.
`--testar` faz tudo e desfaz no fim (nada gravado)."""
import json
import sys
from migration_db import connect

V2 = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7'
IDS_TELAS = ('barras_mentores', 'depoimento', 'projecao', 'compromisso')

MENTORES = ['Steve Jobs', 'Luiza Trajano', 'Elon Musk', 'Bill Gates', 'Tony Robbins', 'Bernardinho', 'Michelle Obama', 'Joel Jota']


def transformar(e):
    ids = [q['id'] for q in e['perguntas']]
    for obrigatoria in ('objetivo_leitura', 'mentores', 'tempo', 'momento', 'conquista'):
        assert obrigatoria in ids, f'a V2 não tem a pergunta {obrigatoria}'

    # 1. roleta "quantos livros você leu" logo depois da pergunta do objetivo (a tela "constancia" vem entre as duas)
    roleta = {
        'id': 'livros_ano', 'estilo': 'roleta', 'texto': 'Quantos livros você leu nos últimos 12 meses?',
        'subtitulo': 'Pode chutar, sem pressão. Role até o número.',
        'numero': {'min': 0, 'max': 50, 'passo': 1, 'inicial': 4, 'unidade': 'livros', 'mais': True},
        'opcoes': [
            {'texto': 'Perfil: Recomeçando agora', 'ate': 0},
            {'texto': 'Perfil: Leitor em construção', 'ate': 3},
            {'texto': 'Perfil: Leitor em evolução', 'ate': 11},
            {'texto': 'Perfil: Leitor frequente', 'ate': 24},
            {'texto': 'Perfil: Leitor voraz', 'ate': 9999},
        ],
    }
    e['perguntas'] = [q for q in e['perguntas'] if q['id'] != 'livros_ano']
    i = [q['id'] for q in e['perguntas']].index('objetivo_leitura')
    e['perguntas'].insert(i + 1, roleta)

    # 2. régua no lugar do "ritmo ideal": as faixas mantêm a pontuação de hoje (5 min → sem_tempo 3, 10 → 2, 15 → 1, mais → nada)
    tempo = next(q for q in e['perguntas'] if q['id'] == 'tempo')
    assert len(tempo['opcoes']) == 4, 'a pergunta tempo mudou: confira as faixas antes de rodar'
    tempo['texto'] = 'Quanto tempo por dia você quer ler?'
    tempo['estilo'] = 'regua'
    tempo['subtitulo'] = 'Arraste a régua. Dá para mudar depois.'
    tempo['numero'] = {'min': 5, 'max': 60, 'passo': 5, 'inicial': 10, 'unidade': 'min/dia', 'min_por_resumo': 10, 'linha': '≈ {resumos_mes} resumos por mês'}
    for o, ate in zip(tempo['opcoes'], (5, 10, 15, 9999)):
        o['ate'] = ate

    # momento: nome do ritual para o plano em números
    momento = next(q for q in e['perguntas'] if q['id'] == 'momento')
    rituais = ['Ritual da manhã', 'Ritual do pós-almoço', 'Ritual do fim de tarde', 'Ritual da noite']
    assert len(momento['opcoes']) == 4
    for o, r in zip(momento['opcoes'], rituais):
        o['ritual'] = r

    # telas novas (se já existirem, são trocadas)
    e['telas'] = [t for t in e['telas'] if t.get('id') not in IDS_TELAS]
    dados = {n: {} for n in MENTORES}
    # Só números com fonte pública: o Davi/Roy preenchem os outros (livros_ano + fonte).
    dados['Bill Gates'] = {'livros_ano': 50, 'fonte': 'Bill Gates, GatesNotes (diz ler cerca de 50 livros por ano)'}
    barras = {
        'id': 'barras_mentores', 'depois_de': 'mentores', 'tipo': 'barras_mentores',
        'titulo': 'Você escolheu {mentores}. Eles liam, em média, {media_livros} livros por ano',
        'texto': 'Ler muito é um hábito. Dá para começar com poucos minutos por dia.', 'botao': 'Continuar',
        'mentores': {'pergunta': 'mentores', 'dados': dados, 'voce': {'pergunta': 'livros_ano', 'rotulo': 'Você'},
                     'titulo_geral': 'Quem inspira o mundo lê muito. Veja quantos livros por ano'},
    }
    depoimento = {
        'id': 'depoimento', 'depois_de': 'conquista', 'tipo': 'depoimento_animado',
        'titulo': 'Quem já usa, recomenda', 'botao': 'Continuar',
        'depoimento_animado': {
            'texto': 'Há 10 anos eu odiava ler… Se eu puder indicar um app, eu indico o Instalivros.',
            'autor': 'FalaLucao · App Store ★★★★★', 'riscado': 'odiava ler', 'grifado': 'eu indico o Instalivros',
        },
    }
    projecao = {
        'id': 'projecao', 'depois_de': 'momento', 'tipo': 'projecao',
        'titulo': '{nome}, lendo {minutos} min por dia você termina {livros} livros em 12 meses',
        'texto': 'Conta feita com 1 resumo a cada 10 minutos. É uma estimativa, não uma promessa.', 'botao': 'Continuar',
        'projecao': {'pergunta': 'tempo'},
    }
    compromisso = {
        'id': 'compromisso', 'depois_de': 'momento', 'tipo': 'compromisso',
        'titulo': '{nome}, você se compromete com o plano que vamos montar?',
        'texto': 'Desenhe um ✓ com o dedo para confirmar.', 'botao': 'Confirmar',
        'compromisso': {'limpar': 'Limpar'},
    }
    telas = e['telas']
    k = next((j for j, t in enumerate(telas) if t['id'] == 'carregamento'), None)
    assert k is not None, 'a V2 não tem a tela carregamento'
    telas[k:k] = [projecao, compromisso]
    telas.extend([barras, depoimento])

    # 7. plano em números na tela de perfil
    perfil = next(t for t in telas if t['id'] == 'perfil_plano')
    perfil['plano_numeros'] = {'titulo': 'Seu plano em números', 'minutos': 'tempo', 'momento': 'momento', 'objetivo': 'objetivo_leitura'}
    return e


c = connect()
try:
    q = c.cursor()
    q.execute("SELECT estrutura FROM quizzes WHERE id = %s AND versao = 2 AND variante_de IS NOT NULL FOR UPDATE", (V2,))
    linhas = q.fetchall()
    assert len(linhas) == 1, 'não achei a V2 (versao 2, variante_de preenchido)'
    e = linhas[0][0]
    if isinstance(e, str):
        e = json.loads(e)
    e = transformar(e)
    q.execute("UPDATE quizzes SET estrutura = %s::jsonb WHERE id = %s AND versao = 2 RETURNING id", (json.dumps(e, ensure_ascii=False), V2))
    assert len(q.fetchall()) == 1
    if '--testar' in sys.argv:
        c.rollback(); print('TESTADO (nada gravado)'); sys.exit(0)
    c.commit(); print('QUIZ_V2_NUMEROS_APLICADO')
except Exception:
    c.rollback(); raise
