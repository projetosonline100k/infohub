# Cobrança inteligente do Jarvis (ver supabase/migrations/20261008190000).
# Usado pela tarefa agendada "cobranca-jarvis" do Claude, a cada 30 min.
#
#   python3 scripts/cobranca-jarvis.py contexto
#       Imprime um JSON com o retrato do momento: atividades atrasadas/de
#       hoje/da semana, plano do dia, foco da última hora (apps e títulos de
#       janela), WhatsApp pendente, promessas atrasadas, conversa recente com
#       o Jarvis e as últimas cobranças com as respostas do Davi.
#   python3 scripts/cobranca-jarvis.py publicar < cobranca.json
#       {"titulo": "<= 60 chars", "etiqueta": "Cliente esperando",
#        "fatos": ["<= 70 chars", ... até 3], "primeiro_passo": "...",
#        "minutos": 12, "proximos": ["<= 50 chars", ... até 3],
#        "motivo", "urgencia": 1-3, "atividade_id"?}
#       ("texto" é opcional: se faltar, é montado a partir dos fatos.)
#       Substitui a cobrança ativa (se houver) pela nova.
#   python3 scripts/cobranca-jarvis.py manter
#       Não publica nada (a cobrança atual continua valendo).
import json
import sys
from datetime import date, datetime, timedelta, timezone
from migration_db import connect

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)


def linhas(q, sql, params=()):
    q.execute(sql, params)
    nomes = [d[0] for d in q.description]
    return [dict(zip(nomes, r)) for r in q.fetchall()]


def serial(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return str(v)


def contexto():
    c = connect()
    try:
        q = c.cursor()
        q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
        uid = q.fetchone()[0]
        agora = datetime.now(timezone.utc)
        base_ativ = '''SELECT a.id, a.titulo, a.data_vencimento, a.prioridade, a.status, a.tempo_estimado,
                              a.responsavel_nome, c.nome_especialista AS projeto,
                              (a.timer_iniciado_em IS NOT NULL) AS timer_rodando
                       FROM atividades a LEFT JOIN clientes c ON c.id = a.cliente_id
                       WHERE a.user_id = %s AND a.deleted_at IS NULL AND NOT a.concluida
                         AND (c.id IS NULL OR NOT c.arquivado)'''
        dados = {
            'agora_utc': agora.isoformat(),
            'atividades_atrasadas': linhas(q, base_ativ + ' AND a.data_vencimento < current_date ORDER BY a.data_vencimento LIMIT 30', (uid,)),
            'atividades_hoje': linhas(q, base_ativ + ' AND a.data_vencimento = current_date ORDER BY a.prioridade DESC LIMIT 30', (uid,)),
            'atividades_proximos_3_dias': linhas(q, base_ativ + " AND a.data_vencimento > current_date AND a.data_vencimento <= current_date + 3 ORDER BY a.data_vencimento LIMIT 20", (uid,)),
            'em_foco_agora': linhas(q, base_ativ + ' AND a.timer_iniciado_em IS NOT NULL', (uid,)),
            'plano_do_dia': linhas(q, '''SELECT p.mandatory_outcome, p.expected_blocker, p.focus_time_available_minutes,
                                                a.titulo AS prioridade_1, a.concluida AS prioridade_1_concluida
                                         FROM daily_plans p LEFT JOIN atividades a ON a.id = p.main_priority_activity_id
                                         WHERE p.user_id = %s AND p.date = current_date''', (uid,)),
            'foco_ultima_hora_por_app': linhas(q, '''SELECT app_name, classification, round(sum(duration_seconds) / 60.0) AS minutos
                                                     FROM focus_activity_events WHERE user_id = %s AND started_at > now() - interval '60 minutes'
                                                     GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10''', (uid,)),
            'janelas_ultima_hora': linhas(q, '''SELECT app_name, left(window_title, 90) AS janela, round(sum(duration_seconds) / 60.0) AS minutos
                                                FROM focus_activity_events WHERE user_id = %s AND started_at > now() - interval '60 minutes'
                                                  AND window_title IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12''', (uid,)),
            'ultimo_sinal_de_uso': linhas(q, 'SELECT max(started_at) AS em FROM focus_activity_events WHERE user_id = %s', (uid,)),
            'sessoes_foco_hoje': linhas(q, '''SELECT count(*) AS sessoes, round(coalesce(sum(duration_seconds), 0) / 60.0) AS minutos
                                              FROM focus_sessions WHERE user_id = %s AND started_at::date = current_date''', (uid,)),
            'concluidas_hoje': linhas(q, '''SELECT titulo FROM atividades WHERE user_id = %s AND concluida AND concluida_em::date = current_date
                                            AND deleted_at IS NULL ORDER BY concluida_em DESC LIMIT 10''', (uid,)),
            'cobrancas_recentes': linhas(q, '''SELECT titulo, texto, status, vezes_adiada, resposta, criada_em, respondida_em, adiada_ate
                                               FROM jarvis_cobrancas WHERE user_id = %s ORDER BY criada_em DESC LIMIT 8''', (uid,)),
            'conversa_recente_com_jarvis': linhas(q, '''SELECT papel, left(texto, 400) AS texto, criada_em FROM jarvis_conversa
                                                        WHERE user_id = %s AND criada_em > now() - interval '24 hours'
                                                        ORDER BY criada_em DESC LIMIT 10''', (uid,)),
        }
        # WhatsApp: cards ainda não respondidos + promessas atrasadas.
        painel = linhas(q, 'SELECT cards, historico, respondidos FROM whatsapp_painel WHERE user_id = %s', (uid,))
        if painel:
            p = painel[0]
            cards = p['cards'] if isinstance(p['cards'], list) else json.loads(p['cards'] or '[]')
            hist = p['historico'] if isinstance(p['historico'], dict) else json.loads(p['historico'] or '{}')
            resp = p['respondidos'] if isinstance(p['respondidos'], dict) else json.loads(p['respondidos'] or '{}')

            def respondido(card):
                if resp.get(card['id']):
                    return True
                req = [i for i in card.get('itens') or [] if not i.get('opcional')]
                return bool(req) and all(resp.get(i['id']) for i in req)

            dados['whatsapp_esperando_resposta'] = [
                {'nome': k.get('nome'), 'quando': k.get('when'), 'tag': k.get('tag'), 'minutos_estimados': k.get('tempo')}
                for k in cards if not respondido(k)
            ]
            hoje = date.today().isoformat()
            dados['promessas_atrasadas'] = [
                pr for pr in hist.get('promessas', []) if pr.get('status') == 'aberta' and pr.get('prazo') and pr['prazo'] < hoje
            ]
        print(json.dumps(dados, ensure_ascii=False, default=serial, indent=1))
    finally:
        c.close()


def publicar(dados):
    titulo = (dados.get('titulo') or '').strip()
    fatos = [str(f).strip() for f in (dados.get('fatos') or []) if str(f).strip()][:3]
    passo = (dados.get('primeiro_passo') or '').strip() or None
    texto = (dados.get('texto') or '').strip() or ' '.join(fatos + ([passo] if passo else []))
    if not titulo or not texto:
        sys.exit('titulo e (fatos ou texto) são obrigatórios')
    proximos = [str(p).strip() for p in (dados.get('proximos') or []) if str(p).strip()][:3]
    minutos = dados.get('minutos')
    minutos = max(1, min(600, int(minutos))) if minutos else None
    urgencia = int(dados.get('urgencia') or 2)
    c = connect()
    try:
        q = c.cursor()
        q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
        uid = q.fetchone()[0]
        q.execute("UPDATE jarvis_cobrancas SET status = 'substituida' WHERE user_id = %s AND status IN ('ativa', 'adiada')", (uid,))
        q.execute(
            '''INSERT INTO jarvis_cobrancas(user_id, titulo, texto, motivo, urgencia, atividade_id,
                                            etiqueta, fatos, primeiro_passo, minutos, proximos)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id''',
            (uid, titulo, texto, dados.get('motivo'), max(1, min(3, urgencia)), dados.get('atividade_id') or None,
             (dados.get('etiqueta') or '').strip() or None, fatos, passo, minutos, proximos),
        )
        novo = q.fetchone()[0]
        c.commit()
        print('PUBLICADA', novo)
    finally:
        c.close()


if len(sys.argv) == 2 and sys.argv[1] == 'contexto':
    contexto()
elif len(sys.argv) == 2 and sys.argv[1] == 'publicar':
    publicar(json.loads(sys.stdin.read()))
elif len(sys.argv) == 2 and sys.argv[1] == 'manter':
    print('MANTIDA')
else:
    sys.exit('uso: contexto | publicar < cobranca.json | manter')
