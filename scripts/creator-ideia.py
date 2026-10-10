# "Separar ideias" do modo Creator (ver migração 20261009070000). Usado pela
# sessão "Inteligência do Infopro" quando chega `/ideia <id>` na Conversa.
#
#   python3 scripts/creator-ideia.py contexto <id>
#       JSON com o número da ideia, o mentorado (nome da pasta), o link, o
#       idioma e a transcrição do vídeo.
#   python3 scripts/creator-ideia.py publicar <id> < ideia.json
#       {"headline_original": "...", "headline_pt": "...", "traducao_pt": "..." | null}
#       Marca a ideia como pronta e acrescenta no fim do documento
#       "Ideias de headline — <mentorado>" (criado na pasta se não existir).
#   python3 scripts/creator-ideia.py erro <id> "motivo"
import html
import json
import sys
from migration_db import connect

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)
TITULO_DOC = 'Ideias de headline — {nome}'
ESTILO = 'font-family: Poppins, sans-serif; font-size: 16px;'


def dono(q):
    q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
    return q.fetchone()[0]


def p(texto, negrito=False):
    t = html.escape(texto or '')
    if negrito:
        t = f'<strong>{t}</strong>'
    return f'<p><span style="{ESTILO}">{t}</span></p>'


def contexto(ideia_id):
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            '''SELECT i.numero, pa.nome, i.link, coalesce(i.idioma, t.idioma), t.texto
               FROM creator_ideias i JOIN pastas_atividade pa ON pa.id = i.pasta_id
               LEFT JOIN creator_transcricoes t ON t.id = i.transcricao_id
               WHERE i.id = %s AND i.user_id = %s''',
            (ideia_id, uid),
        )
        r = q.fetchone()
        if not r:
            sys.exit('Ideia não encontrada')
        print(json.dumps({'ideia_id': ideia_id, 'numero': r[0], 'mentorado': r[1], 'link': r[2],
                          'idioma': r[3], 'transcricao': r[4]}, ensure_ascii=False, indent=1))
    finally:
        c.close()


def publicar(ideia_id, dados):
    headline_original = (dados.get('headline_original') or '').strip()
    headline_pt = (dados.get('headline_pt') or '').strip()
    traducao = (dados.get('traducao_pt') or '').strip() or None
    if not headline_pt:
        sys.exit('headline_pt é obrigatória')
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            '''SELECT i.numero, i.link, i.pasta_id, pa.nome, pa.cliente_id, coalesce(i.idioma, t.idioma), t.texto
               FROM creator_ideias i JOIN pastas_atividade pa ON pa.id = i.pasta_id
               LEFT JOIN creator_transcricoes t ON t.id = i.transcricao_id
               WHERE i.id = %s AND i.user_id = %s''',
            (ideia_id, uid),
        )
        numero, link, pasta_id, nome, cliente_id, idioma, transcricao = q.fetchone()
        titulo = TITULO_DOC.format(nome=nome)
        q.execute(
            'SELECT id FROM documentos WHERE pasta_id = %s AND titulo = %s AND deleted_at IS NULL ORDER BY created_at LIMIT 1',
            (pasta_id, titulo),
        )
        linha = q.fetchone()
        if linha:
            doc_id = linha[0]
        else:
            q.execute(
                '''INSERT INTO documentos(titulo, conteudo, user_id, cliente_id, pasta_id)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id''',
                (titulo, p(f'Ideias separadas pelo Jarvis (modo Creator) para {nome}.'), uid, cliente_id, pasta_id),
            )
            doc_id = q.fetchone()[0]

        traduzido = bool(idioma and not str(idioma).startswith('pt'))
        bloco = [
            f'<p><span style="{ESTILO}">​</span></p>',
            f'<h3><strong>IDEIA {numero:02d}</strong></h3>',
            p(f'Headline: {headline_pt}', negrito=True),
        ]
        if traduzido and headline_original:
            bloco.append(p(f'Original ({idioma}): {headline_original}'))
        bloco.append(f'<p><span style="{ESTILO}"><a href="{html.escape(link, quote=True)}">Link do vídeo</a></span></p>')
        corpo = traducao if traduzido and traducao else transcricao
        if corpo:
            bloco.append('<h4>Transcrição traduzida</h4>' if traduzido and traducao else '<h4>Transcrição</h4>')
            bloco.append(p(corpo))
        q.execute(
            "UPDATE documentos SET conteudo = coalesce(conteudo, '') || %s, updated_at = now() WHERE id = %s",
            (''.join(bloco), doc_id),
        )
        q.execute(
            '''UPDATE creator_ideias SET status = 'pronta', headline_original = %s, headline_pt = %s,
                 traducao_pt = %s, documento_id = %s, erro = NULL WHERE id = %s''',
            (headline_original or None, headline_pt, traducao, doc_id, ideia_id),
        )
        c.commit()
        print('IDEIA_PRONTA', numero, doc_id)
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def erro(ideia_id, motivo):
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute("UPDATE creator_ideias SET status = 'erro', erro = %s WHERE id = %s AND user_id = %s", (motivo, ideia_id, uid))
        c.commit()
        print('IDEIA_ERRO')
    finally:
        c.close()


if len(sys.argv) == 3 and sys.argv[1] == 'contexto':
    contexto(sys.argv[2])
elif len(sys.argv) == 3 and sys.argv[1] == 'publicar':
    publicar(sys.argv[2], json.loads(sys.stdin.read()))
elif len(sys.argv) == 4 and sys.argv[1] == 'erro':
    erro(sys.argv[2], sys.argv[3])
else:
    sys.exit('uso: contexto <id> | publicar <id> < ideia.json | erro <id> "motivo"')
