"""Aplica na V3 do Instalivros (`instalivros-v3`) a identidade visual do HTML "Quiz Instalivros" (fundo quadriculado
azul-marinho, cartão central, dourado, Fraunces + Inter). Só mexe em visual, cor, rótulos da captura e espaços das ofertas."""
import json
from migration_db import connect

SLUG = 'instalivros-v3'
VISUAL = {
    'fundo_css': 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px) 0 0/44px 44px, linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) 0 0/44px 44px, #0a1226',
    'base': '#0a1226', 'barra': '#0a1226',
    'texto': '#eef2fb', 'texto_2': '#a9b4cc',
    'card': '#18284d', 'borda_card': 'rgba(255,255,255,.13)',
    'botao': '#f4b942', 'botao_texto': '#1b1300', 'destaque': '#f4b942',
    'fontes_url': 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap',
    'fonte_titulo': '"Fraunces", Georgia, "Times New Roman", serif',
    'fonte_texto': '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'ok': '#5dd6a2', 'oferta_fundo': 'linear-gradient(180deg,#1a2a52,#111d3b)',
    'marca': {'antes': 'Insta', 'destaque': 'livros', 'subtitulo': 'Descubra se você está aproveitando seu tempo livre ao máximo', 'rodape': '© Instalivros', 'imagem': 'https://ucjyobemrxqfcoopkcgb.supabase.co/storage/v1/object/public/quiz-imagens/roy/5e78e624-f95c-40a8-b815-86901e731699/9d9f59a8-98f6-4b27-a11c-081aa3ce2739/logo-instalivros.png'},
    'cartao': {'fundo': '#111d3b', 'borda': 'rgba(255,255,255,.13)', 'raio': 20, 'sombra': '0 24px 60px rgba(0,0,0,.35)'},
}
c = connect()
q = c.cursor()
q.execute("select id, estrutura from quizzes where slug='instalivros-v3'")
orig = q.fetchone()
est = orig[1] if isinstance(orig[1], dict) else json.loads(orig[1])
def nbsp(x):
    # "R$ 24,75" não quebra no meio (como no HTML de referência)
    if isinstance(x, str): return x.replace('R$ ', 'R$\u00a0')
    if isinstance(x, list): return [nbsp(i) for i in x]
    if isinstance(x, dict): return {k: nbsp(v) for k, v in x.items()}
    return x
est['oferta'] = nbsp(est.get('oferta'))
# Textos do resultado iguais aos do HTML de referência: cartões "O que o Instalivros faz" (Q1 e Q6) e as frases do recap (Q2, Q3, Q5).
BENEF = {
  'objetivo': [("Para pensar melhor", "Livros como Sapiens, Mindset e Princípios para ampliar o jeito como você pensa."),
               ("Para construir rotina", "Livros como Atomic Habits, Deep Work e O Poder do Hábito para transformar intenção em hábito."),
               ("Para ter o que dizer", "Livros como Sapiens, Meditações e Pai Rico Pai Pobre para você participar de qualquer conversa."),
               ("Para mudar a decisão", "Livros como Pense e Enriqueça, Mindset e Princípios para mudar a forma como você decide.")],
  'impede': [("Cabe no seu dia", "Resumos em áudio e em texto para você aprender no trânsito, na fila ou no intervalo, sem reservar horas."),
             ("Sempre tem o próximo livro", "Mais de 900 livros de produtividade, marketing, empreendedorismo e desenvolvimento pessoal. Você escolhe pelo assunto que precisa agora."),
             ("Um livro por vez, sem peso", "Livros resumidos para terminar na mesma pausa em que você ia deixar para depois."),
             ("Mesmo celular, ideias melhores", "Troque parte do tempo de tela por livros em áudio e texto, direto no celular.")],
}
for pg in est['perguntas']:
    for k, o in enumerate(pg['opcoes']):
        if pg['id'] in BENEF: o['beneficio'] = {'titulo': BENEF[pg['id']][k][0], 'texto': BENEF[pg['id']][k][1]}
est['visual'] = VISUAL
est['cor'] = '#f4b942'
est.setdefault('captura', {})
est['captura']['rotulos'] = {'nome': 'Nome', 'email': 'E-mail', 'whatsapp': 'WhatsApp'}
est['captura']['exemplos'] = {'nome': 'Seu nome', 'email': 'seu@email.com', 'whatsapp': '(00) 00000-0000'}
est['tema'] = 'escuro'
q.execute("select id from quizzes where slug=%s", (SLUG,))
ex = q.fetchone()
if ex:
    q.execute("update quizzes set estrutura=%s::jsonb where id=%s", (json.dumps(est), ex[0]))
    print('ATUALIZADO', SLUG)
else:
    q.execute("""insert into quizzes (cliente_id,user_id,titulo,pedido,slug,status,estrutura,pixels)
      select cliente_id,user_id,'Instalivros V3 (visual do Claude)',pedido,%s,'revisar',%s::jsonb,pixels from quizzes where slug='instalivros-v3'
      returning previa_token""", (SLUG, json.dumps(est)))
    print('CRIADO', SLUG, q.fetchone()[0])
c.commit()
