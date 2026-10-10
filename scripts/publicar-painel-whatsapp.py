# Publica o painel de mentorados (rotina "Ideias de resposta WhatsApp") na
# guia "WhatsApp" do Jarvis. Lê .claude/painel/cards.json (gerado pelo
# build.py) e .claude/painel/historico.json e grava na linha do dono em
# public.whatsapp_painel. Mantém o que já foi marcado como respondido e
# fecha o pedido do botão "Atualizar" do Jarvis, se houver.
#   python3 scripts/publicar-painel-whatsapp.py [email]
from pathlib import Path
import json
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
painel = root / '.claude/painel'
email = sys.argv[1] if len(sys.argv) > 1 else 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)
cards = json.loads((painel / 'cards.json').read_text())
historico = json.loads((painel / 'historico.json').read_text())

c = connect()
try:
    q = c.cursor()
    q.execute('SELECT id FROM auth.users WHERE lower(email) = lower(%s)', (email,))
    row = q.fetchone()
    if not row:
        sys.exit(f'Usuário não encontrado: {email}')
    q.execute(
        '''INSERT INTO public.whatsapp_painel(user_id, cards, historico, atualizado_em)
           VALUES (%s, %s::jsonb, %s::jsonb, now())
           ON CONFLICT (user_id) DO UPDATE SET cards = excluded.cards, historico = excluded.historico, atualizado_em = now(),
             atualizacao_status = CASE WHEN whatsapp_painel.atualizacao_status IN ('pedida', 'rodando') THEN 'ok' ELSE whatsapp_painel.atualizacao_status END,
             atualizacao_mensagem = null''',
        (row[0], json.dumps(cards, ensure_ascii=False), json.dumps(historico, ensure_ascii=False)),
    )
    c.commit()
    print(f'PUBLICADO {len(cards)} cards')
except Exception:
    c.rollback()
    raise
finally:
    c.close()
