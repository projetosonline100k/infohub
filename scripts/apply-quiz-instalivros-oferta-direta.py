"""V3 do Instalivros, 22/11/2026: o fim vira Resultado → escolher 1 bônus → 7 dias (livros + benefício) → plano mensal em cima do app.
Usa o modo "direto" (como a V2) só com o plano Mensal. O restante da oferta antiga (FAQ, depoimentos, vídeo, aviso…) fica nos campos:
para voltar à página longa, tirar `modo`. Só mexe no rascunho; Publicar no editor."""
import json
from migration_db import connect

c = connect(); q = c.cursor()
q.execute("select id, estrutura from quizzes where slug='instalivros-v3'")
qid, est = q.fetchone(); est = est if isinstance(est, dict) else json.loads(est)
q.execute("select estrutura->'oferta'->'bonus' from quizzes where slug='instalivros-v2'")
bonus = q.fetchone()[0]; bonus = bonus if isinstance(bonus, list) else json.loads(bonus)
o = est['oferta']
o['modo'] = 'direto'
o['bonus'] = bonus
o['bonus_escolha_titulo'] = '{nome}, escolha 1 bônus para levar de presente'
o['bonus_escolhido_rotulo'] = 'Bônus escolhido'
o['continuar_resultado'] = 'Continuar'
o['sete_dias'] = {'pergunta': 'aprender', 'titulo': 'Você só vai precisar de 7 dias para mudar da água para vinho!!',
                  'texto': 'Com base nas suas escolhas, estes são os livros que o Instalivros selecionou para você:'}
o['titulo'] = '{nome}, seu plano personalizado está pronto!'
o['preco_descricao'] = 'por mês'
o['bonus_mostrar_nome'] = True
o['rodape_legal'] = 'CNPJ 34.278.071/0001-72'
o['cancele_texto'] = 'Garantia de 30 dias, cancele quando quiser'
o['planos'] = [{'id': 'mensal', 'nome': 'Instalivros', 'selo': 'LEVA 1 BÔNUS', 'preco': 'R$ 24,90', 'cta_url': 'https://chk.eduzz.com/7WXGJG1Y0A',
                'destaque': True, 'com_bonus': True, 'bonus_regra': 'escolhido'}]
q.execute("update quizzes set estrutura=%s where id=%s", (json.dumps(est, ensure_ascii=False), qid)); c.commit()
print('ok', [b['titulo'] for b in bonus])
