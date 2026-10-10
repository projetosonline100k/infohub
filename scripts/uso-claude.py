# Publica no Jarvis o uso do plano do Claude (o JSON que a ferramenta de uso
# do app desktop devolve: {"plan": {"plan", "windows": [{label, percentUsed,
# resetsAt}], "extraUsage": {"enabled"}}}). Ver migração 20261008230000.
#   python3 scripts/uso-claude.py publicar < uso.json
import json
import sys
from migration_db import connect

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)

if len(sys.argv) != 2 or sys.argv[1] != 'publicar':
    sys.exit('uso: publicar < uso.json')

dados = json.loads(sys.stdin.read())
plano = dados.get('plan', dados)
janelas = plano.get('windows') or []
cinco = next((j for j in janelas if '5' in j.get('label', '')), None)
semana = next((j for j in janelas if 'eekly' in j.get('label', '') or 'semana' in j.get('label', '').lower()), None)

c = connect()
try:
    q = c.cursor()
    q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
    uid = q.fetchone()[0]
    q.execute(
        '''INSERT INTO claude_uso(user_id, plano, janela_5h_pct, janela_5h_renova_em, semanal_pct, semanal_renova_em, extra_ativo, atualizado_em)
           VALUES (%s, %s, %s, %s, %s, %s, %s, now())
           ON CONFLICT (user_id) DO UPDATE SET plano = excluded.plano, janela_5h_pct = excluded.janela_5h_pct,
             janela_5h_renova_em = excluded.janela_5h_renova_em, semanal_pct = excluded.semanal_pct,
             semanal_renova_em = excluded.semanal_renova_em, extra_ativo = excluded.extra_ativo, atualizado_em = now()''',
        (uid, plano.get('plan'), cinco and cinco.get('percentUsed'), cinco and cinco.get('resetsAt'),
         semana and semana.get('percentUsed'), semana and semana.get('resetsAt'), bool((plano.get('extraUsage') or {}).get('enabled'))),
    )
    c.commit()
    print('USO_PUBLICADO')
finally:
    c.close()
