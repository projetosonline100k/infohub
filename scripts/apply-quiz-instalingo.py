"""Quiz do Instalingo (23/11/2026), recriado no Hub a partir do HTML "quiz-instalingo" do Davi (professora Mariah).
Mesmo molde da V3 do Instalivros: visual "skin" escuro (preto e grafite do Instagram, Bricolage Grotesque + DM Sans), 6 perguntas,
captura de contato, resultado por nível (anel 1 a 3) e oferta única (Black Friday: de R$ 297 por R$ 97,00 por ano).
Cria o quiz no projeto INSTALINGO com status "revisar" (só a prévia). Pode rodar de novo: troca a estrutura do quiz existente."""
import json
from migration_db import connect

SLUG = 'instalingo'
CLIENTE = '09d84886-647f-4daf-932f-b9e3878d1907'   # clientes.nome_especialista = INSTALINGO
USER = '751fbfbc-af4d-4ad2-83a0-3ad6ca65fb51'
LINK = 'https://pay.kiwify.com.br/7aIamCT'
GRAD = 'linear-gradient(45deg,#F58529 0%,#DD2A7B 52%,#8134AF 100%)'

VISUAL = {
    'fundo_css': 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px) 0 0/64px 64px, linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px) 0 0/64px 64px, #000000',
    'base': '#000000', 'barra': '#000000',
    'texto': '#F5F5F5', 'texto_2': '#A8A8A8',
    'card': '#121212', 'borda_card': '#2A2A2A',
    'botao': GRAD, 'botao_texto': '#FFFFFF', 'destaque': '#FF4D97',
    'fontes_url': 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap',
    'fonte_titulo': '"Bricolage Grotesque", "Trebuchet MS", system-ui, sans-serif',
    'fonte_texto': '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    'ok': '#3DDC97', 'oferta_fundo': 'linear-gradient(180deg,#2B1A12,#121212)',
    'marca': {'antes': 'Insta', 'destaque': 'lingo', 'subtitulo': '✦ Quiz de inglês', 'rodape': ''},
    'cartao': {'fundo': '#121212', 'borda': '#2A2A2A', 'raio': 24, 'sombra': '0 18px 50px rgba(0,0,0,.45)'},
}

REELS = {'titulo': 'Reels curtos', 'texto': 'Aprenda em qualquer intervalo do dia, sem precisar separar horas de estudo.'}
BF = {
    'Vocabulário': ('Vocabulário', 'Palavras novas aparecem dentro de cenas curtas, no contexto em que elas realmente se usam.'),
    'Entender as falas': ('Escuta', 'Você treina o ouvido com falas reais em vídeos curtos, sem depender só de legenda.'),
    'Falar com confiança': ('Confiança', 'Você ouve, repete e ganha segurança para falar, um Reel de cada vez.'),
    'Não sei por onde começar': ('Por onde começar', 'Sua trilha já começa no seu nível, sem você precisar decidir nada.'),
}

def op(texto, icone, resumo=None, nota=None, beneficio=None, emoji=None):
    o = {'texto': texto, 'icone': icone}
    if resumo: o['resumo'] = resumo
    if nota is not None: o['nota'] = nota
    if beneficio: o['beneficio'] = beneficio
    return o

PERGUNTAS = [
    {'id': 'motivo', 'texto': 'Por que você quer aprender inglês?', 'subtitulo': 'Toque na opção que mais combina com você', 'estilo': 'cartoes', 'opcoes': [
        op('Viajar com mais segurança', 'Plane', 'quer viajar com mais segurança', beneficio=REELS),
        op('Crescer na carreira', 'Briefcase', 'quer crescer na carreira', beneficio=REELS),
        op('Entender filmes e séries', 'Film', 'quer entender filmes e séries sem legenda', beneficio=REELS),
        op('Tudo isso!', 'Sparkles', 'quer o inglês para viagem, carreira e diversão', beneficio=REELS)]},
    {'id': 'tempo', 'texto': 'Há quanto tempo você estuda inglês?', 'estilo': 'cartoes', 'opcoes': [
        op('Nunca estudei', 'Sprout', 'nunca estudou inglês', 0),
        op('Menos de 1 ano', 'Leaf', 'estuda há menos de 1 ano', 1),
        op('1 a 3 anos', 'TreeDeciduous', 'estuda há 1 a 3 anos', 2),
        op('Mais de 3 anos', 'Crown', 'estuda há mais de 3 anos', 3)]},
    {'id': 'escuta', 'texto': 'O que acontece quando você ouve inglês num vídeo?', 'subtitulo': 'Seja sincero, não tem resposta errada!', 'estilo': 'lista', 'opcoes': [
        op('Não entendo quase nada', 'VolumeX', 'não entende quase nada do que ouve', 0),
        op('Pego algumas palavras', 'Volume1', 'pega só algumas palavras quando ouve', 1),
        op('Entendo a maior parte', 'Volume2', 'entende a maior parte do que ouve', 2)]},
    {'id': 'check', 'texto': 'Complete a frase: “If I ____ more time, I would study every day.”', 'subtitulo': 'Se não souber, tudo bem. É só marcar.', 'estilo': 'lista', 'opcoes': [
        op('have', 'MessageCircle', nota=0), op('had', 'MessageCircle', nota=2), op('will have', 'MessageCircle', nota=0), op('Não sei', 'CircleHelp', nota=0)]},
    {'id': 'metodo', 'texto': 'Como você estuda inglês hoje?', 'estilo': 'cartoes', 'opcoes': [
        op('Aulas ou cursos', 'BookOpen', 'aulas ou cursos'), op('Apps e jogos', 'Smartphone', 'apps e jogos'),
        op('Vídeos soltos', 'Play', 'vídeos soltos'), op('Quase não estudo', 'Clock', 'quase nada')]},
    {'id': 'trava', 'texto': 'O que mais te trava no inglês?', 'subtitulo': 'Escolha o maior obstáculo', 'estilo': 'cartoes', 'opcoes': [
        op('Vocabulário', 'BookOpen', 'vocabulário', beneficio={'titulo': BF['Vocabulário'][0], 'texto': BF['Vocabulário'][1]}),
        op('Entender as falas', 'Ear', 'entender as falas', beneficio={'titulo': BF['Entender as falas'][0], 'texto': BF['Entender as falas'][1]}),
        op('Falar com confiança', 'Mic', 'falar com confiança', beneficio={'titulo': BF['Falar com confiança'][0], 'texto': BF['Falar com confiança'][1]}),
        op('Não sei por onde começar', 'Compass', 'não saber por onde começar', beneficio={'titulo': BF['Não sei por onde começar'][0], 'texto': BF['Não sei por onde começar'][1]})]},
]

PERFIS = [
    {'id': 'aprendiz', 'nome': 'Aprendiz', 'resumo': 'Começando a jornada', 'frase': 'Ótimo ponto de partida. Cada Reel que você assistir já conta.', 'descricao': 'Base primeiro: frases do dia a dia e vocabulário essencial, no seu ritmo.'},
    {'id': 'intermediario', 'nome': 'Intermediário', 'resumo': 'No caminho certo', 'frase': 'Você já está bem à frente. Falta pouco para o próximo salto.', 'descricao': 'Próximo salto: ampliar vocabulário e entender falas mais rápidas e naturais.'},
    {'id': 'avancado', 'nome': 'Avançado', 'resumo': 'Rumo à fluência', 'frase': 'Nível alto! O foco agora é naturalidade.', 'descricao': 'Fluência natural: conteúdo autêntico, sem legenda e sem muleta.'},
]

MARIAH = 'Mais de 4 anos ensinando inglês em faculdades e em aulas individuais. Aprendeu idiomas estudando sozinha, virou poliglota e fala inglês, espanhol e japonês. É a professora por trás do Instalingo.'

EST = {
    'cor': '#DD2A7B', 'tema': 'escuro', 'visual': VISUAL, 'progresso': 'linear',
    'intro': {'titulo': 'Descubra seu nível de inglês e por onde começar no Instalingo',
              'subtitulo': 'Responda 6 perguntas rápidas e receba seu diagnóstico personalizado.',
              'botao': 'Começar o Quiz', 'rodape': 'Leva menos de 1 minuto'},
    'perguntas': PERGUNTAS, 'perfis': PERFIS,
    'indice': {'max': 7, 'base': 0, 'teto': 7, 'anel': 'nivel', 'nivel_titulo': 'Seu nível:', 'titulo': 'Seu nível', 'falta': '',
               'recap': 'Você contou que {resposta:motivo}, {resposta:tempo} e {resposta:escuta}. O que mais te trava hoje: **{resposta:trava}**. Isso tem jeito.',
               'faixas': [{'ate': 2, 'perfil': 'aprendiz'}, {'ate': 5, 'perfil': 'intermediario'}, {'ate': 7, 'perfil': 'avancado'}],
               'beneficios_titulo': 'O que o app faz com isso', 'beneficios_de': ['trava', 'motivo']},
    'telas': [
        {'id': 'preparando', 'depois_de': 'intro', 'tipo': 'carregando', 'titulo': 'Preparando suas perguntas…', 'duracao': 1.2, 'itens': []},
        {'id': 'diagnostico', 'depois_de': 'trava', 'tipo': 'carregando', 'titulo': 'Montando o seu diagnóstico…', 'duracao': 1.4, 'itens': []},
    ],
    'captura': {'ativa': True, 'depois_de': 'trava', 'pedir': ['nome', 'email', 'whatsapp'], 'selo': 'QUIZ COMPLETO!', 'titulo': 'Falta pouco!',
                'texto': 'Seu resultado está pronto. Me diz pra onde enviar!', 'botao': 'Ver Meu Resultado', 'pular': 'prefiro ver meu resultado sem preencher',
                'nota': '15 segundos pra preencher · Seus dados ficam seguros', 'etapas': False,
                'rotulos': {'nome': 'Nome', 'email': 'E-mail', 'whatsapp': 'WhatsApp'},
                'exemplos': {'nome': 'Seu nome', 'email': 'seu@email.com', 'whatsapp': '(00) 00000-0000'}},
    'oferta': {'titulo': 'Destrave o seu inglês.', 'preco_rotulo': 'BLACK FRIDAY · ACESSO ANUAL', 'preco': 'R$ 97,00', 'preco_detalhe': 'por ano',
               'preco_sub': 'de R$ 297 por R$ 97,00', 'cta_texto': 'Quero o Instalingo por R$ 97,00', 'cta_url': LINK,
               'garantia': 'Garantia de 7 dias. Se por qualquer motivo você não gostar, devolvemos todo o seu investimento.',
               'selos': ['Pagamento seguro', '7 dias de garantia'],
               'faq': [{'pergunta': 'É mensalidade?', 'resposta': 'Não. O acesso é anual: R$ 97,00 por ano (de R$ 297) na condição de Black Friday.'},
                       {'pergunta': 'E se eu não gostar?', 'resposta': 'Você tem 7 dias de garantia. Se por qualquer motivo não gostar, devolvemos todo o seu investimento.'},
                       {'pergunta': 'Preciso já saber inglês?', 'resposta': 'Não. O quiz mostra se você é Aprendiz, Intermediário ou Avançado, e você começa pelo seu nível.'},
                       {'pergunta': 'Quem criou o Instalingo?', 'resposta': 'A professora Mariah: mais de 4 anos ensinando inglês em faculdades e em aulas individuais, poliglota que fala inglês, espanhol e japonês.'},
                       {'pergunta': 'Onde faço o pagamento?', 'resposta': 'No checkout da Kiwify, que abre ao tocar no botão de compra.'}],
               'fechamento_titulo': 'Quem é a Mariah', 'fechamento': MARIAH},
}

c = connect(); q = c.cursor()
q.execute("select id from quizzes where slug=%s", (SLUG,))
ex = q.fetchone()
if ex:
    q.execute("update quizzes set estrutura=%s::jsonb where id=%s returning previa_token", (json.dumps(EST, ensure_ascii=False), ex[0]))
    print('ATUALIZADO', SLUG, q.fetchone()[0])
else:
    q.execute("""insert into quizzes (cliente_id,user_id,titulo,pedido,slug,status,estrutura)
      values (%s,%s,%s,%s,%s,'revisar',%s::jsonb) returning previa_token""",
      (CLIENTE, USER, 'Quiz do Instalingo (diagnóstico de nível de inglês)', 'Recriar no Hub o quiz do Instalingo (professora Mariah), igual ao HTML do Davi.', SLUG, json.dumps(EST, ensure_ascii=False)))
    print('CRIADO', SLUG, q.fetchone()[0])
c.commit()
