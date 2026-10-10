# "Analisar para cliente" do modo Creator (ver migração 20261009050000).
# Usado pela sessão "Inteligência do Infopro" quando chega `/analisar <id>`
# na Conversa do Jarvis.
#
#   python3 scripts/creator-analise.py contexto <id>
#       Marca como 'rodando' e imprime um JSON com o cliente (nome, nicho,
#       núcleo de influência), o nicho livre que o Davi escreveu e as
#       transcrições escolhidas (id, título, autor, link, texto).
#   python3 scripts/creator-analise.py publicar <id> < resultado.json
#       {"resumo_geral": "...", "itens": [{"transcricao_id", "serve": true,
#        "motivo", "resumo", "headlines": ["...", x5]}]}
#   python3 scripts/creator-analise.py erro <id> "motivo"
import json
import sys
from migration_db import connect

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)


def dono(q):
    q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
    return q.fetchone()[0]


def contexto(analise_id):
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            "UPDATE creator_analises SET status = 'rodando' WHERE id = %s AND user_id = %s "
            "RETURNING cliente_id, nicho_livre, transcricao_ids",
            (analise_id, uid),
        )
        linha = q.fetchone()
        if not linha:
            sys.exit('Análise não encontrada')
        cliente_id, nicho_livre, ids = linha
        cliente = None
        if cliente_id:
            q.execute('SELECT nome_especialista, nicho FROM clientes WHERE id = %s', (cliente_id,))
            nome, nicho = q.fetchone()
            q.execute(
                '''SELECT coalesce(cat.titulo, n.categoria) AS categoria, n.texto
                   FROM nucleo_influencia n LEFT JOIN categorias_nucleo cat ON cat.id::text = n.categoria
                   WHERE n.cliente_id = %s ORDER BY n.ordem''',
                (cliente_id,),
            )
            nucleo = [{'categoria': r[0], 'texto': r[1]} for r in q.fetchall()]
            cliente = {'nome': nome, 'nicho': nicho, 'nucleo_de_influencia': nucleo}
        q.execute(
            '''SELECT id, titulo, autor, link, texto FROM creator_transcricoes
               WHERE user_id = %s AND id = ANY(%s::uuid[])''',
            (uid, [str(i) for i in ids]),
        )
        transcricoes = [
            {'id': str(r[0]), 'titulo': r[1], 'autor': r[2], 'link': r[3], 'texto': r[4]} for r in q.fetchall()
        ]
        c.commit()
        print(json.dumps({'analise_id': analise_id, 'cliente': cliente, 'nicho_livre': nicho_livre,
                          'transcricoes': transcricoes}, ensure_ascii=False, indent=1))
    finally:
        c.close()


def gravar(analise_id, status, resultado=None, erro=None):
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            '''UPDATE creator_analises SET status = %s, resultado = %s::jsonb, erro = %s, concluida_em = now()
               WHERE id = %s AND user_id = %s''',
            (status, json.dumps(resultado, ensure_ascii=False) if resultado is not None else None, erro, analise_id, uid),
        )
        c.commit()
        print('ANALISE_' + status.upper())
    finally:
        c.close()


if len(sys.argv) == 3 and sys.argv[1] == 'contexto':
    contexto(sys.argv[2])
elif len(sys.argv) == 3 and sys.argv[1] == 'publicar':
    dados = json.loads(sys.stdin.read())
    itens = dados.get('itens') or []
    for item in itens:
        item['headlines'] = [str(h).strip() for h in (item.get('headlines') or []) if str(h).strip()][:5]
        item['serve'] = bool(item.get('serve'))
    gravar(sys.argv[2], 'pronta', {'resumo_geral': dados.get('resumo_geral'), 'itens': itens})
elif len(sys.argv) == 4 and sys.argv[1] == 'erro':
    gravar(sys.argv[2], 'erro', erro=sys.argv[3])
else:
    sys.exit('uso: contexto <id> | publicar <id> < resultado.json | erro <id> "motivo"')
