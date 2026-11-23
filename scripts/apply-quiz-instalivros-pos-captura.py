"""V3 do Instalivros (`instalivros-v3`), 22/11/2026: depois do contato vem carregamento → depoimento (Bruno, do WhatsApp) →
Etapa 1 (objetivos) → Etapa 2 (o que quer aprender) → Etapa 3 (livros para curtir) → "Preparando seu conteúdo" → resultado.
Mexe só no rascunho (`estrutura`); para o link público, apertar Publicar no editor. Pode rodar de novo (troca o que já existe)."""
import json
from migration_db import connect

SLUG = 'instalivros-v3'
OBJ = ['Ficar mais inteligente', 'Impulsionar minha carreira', 'Liderar e gerenciar melhor', 'Criar hábitos melhores', 'Entender o mundo', 'Crescer como pessoa', 'Me inspirar com novas ideias']
OBJ = ['Impulsionar minha carreira', 'Liderar e gerenciar melhor', 'Criar hábitos melhores', 'Entender o mundo', 'Crescer como pessoa', 'Me inspirar com novas ideias']
TEMAS = ['Foco e produtividade', 'Hábitos', 'Autoconfiança', 'Comunicação', 'Finanças', 'Carreira', 'Mentalidade', 'Liderança']
BRUNO = {'nome': 'Bruno Pereira de Souza', 'texto': 'Sou assinante do Instalivros desde a fundação, quando comecei a ideia era somente um hobby mas se tornou parte do dia a dia, as ideias vão surgindo a medida que você vai ouvindo os resumos, e isso te desperta o desejo de comprar o livro físico e ir se aprofundando cada vez mais no assunto, pra quem está em dúvida se vale a pena, se permita voltar a aprender, te garanto que o resultado vai te surpreender.'}

c = connect(); q = c.cursor()
q.execute("select id, estrutura from quizzes where slug=%s", (SLUG,))
qid, est = q.fetchone()
est = est if isinstance(est, dict) else json.loads(est)

ids_novos = {'objetivos', 'aprender'}
est['perguntas'] = [p for p in est['perguntas'] if p['id'] not in ids_novos] + [
    {'id': 'objetivos', 'texto': 'Quais são seus maiores objetivos no momento?', 'subtitulo': 'Você pode atualizar suas respostas a qualquer momento.',
     'estilo': 'lista', 'multipla': True, 'kicker': 'Etapa 1 de 3', 'opcoes': [{'texto': t} for t in OBJ]},
    {'id': 'aprender', 'texto': 'Sobre o que você gostaria de aprender mais?', 'subtitulo': 'Escolha quantos quiser.',
     'estilo': 'lista', 'multipla': True, 'kicker': 'Etapa 2 de 3', 'opcoes': [{'texto': t} for t in TEMAS]},
]
est['captura']['depois_de'] = 'impede'
velhas = {'carregando_contato', 'depoimento_bruno', 'curtir_livros', 'preparando_conteudo'}
est['telas'] = [t for t in (est.get('telas') or []) if t['id'] not in velhas] + [
    {'id': 'carregando_contato', 'depois_de': 'impede', 'tipo': 'carregando', 'titulo': 'Preparando suas recomendações', 'duracao': 4.5,
     'itens': ['Salvando seus dados', 'Analisando suas respostas', 'Separando os melhores resumos']},
    {'id': 'depoimento_bruno', 'depois_de': 'impede', 'tipo': 'depoimento', 'titulo': 'Grandes resultados à vista!',
     'texto': '87% das pessoas que usam o app Instalivros fizeram mudanças positivas em suas vidas.', 'botao': 'Continuar', 'depoimentos': [BRUNO]},
    {'id': 'curtir_livros', 'depois_de': 'aprender', 'tipo': 'curtir_livros', 'titulo': 'Este título parece interessante para você?',
     'texto': 'Títulos que você gostar serão salvos na sua biblioteca para aproveitar depois.', 'curtir': {'pergunta': 'aprender', 'quantidade': 5, 'etapa': 'Etapa 3 de 3'}},
    {'id': 'preparando_conteudo', 'depois_de': 'aprender', 'tipo': 'carregando', 'titulo': 'Preparando seu conteúdo', 'duracao': 6,
     'itens': ['Salvando títulos na sua Biblioteca', 'Selecionando recomendações de títulos', 'Criando coleções que você pode gostar']},
]
q.execute("update quizzes set estrutura=%s where id=%s", (json.dumps(est, ensure_ascii=False), qid))
c.commit()
print('ok', len(est['perguntas']), 'perguntas;', len(est['telas']), 'telas')
