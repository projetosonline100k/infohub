"""Gerencia as automações do Instagram ("comentou a palavra, recebe a DM").

Uso:
  python3 scripts/instagram-automacoes.py status
  python3 scripts/instagram-automacoes.py conectar          (pede o token sem ecoar)
  python3 scripts/instagram-automacoes.py posts [--limite 15]
  python3 scripts/instagram-automacoes.py listar
  python3 scripts/instagram-automacoes.py criar --nome "Mentoria" --palavras "QUERO,EU QUERO" \\
        --dm "Oi! Aqui está o link: https://..." [--resposta "Te mandei no direct!"]... \\
        [--post <id ou link do post>]... [--gatilhos comentario,dm,story] [--exata] [--pausada]

Gatilhos: comentario (padrão; --post e --resposta valem só para ele), dm
(mandou a palavra no direct) e story (respondeu um story com a palavra).
  python3 scripts/instagram-automacoes.py editar <ref> [mesmas opções do criar] [--todos-posts] [--sem-resposta]
  python3 scripts/instagram-automacoes.py pausar <ref> | ativar <ref> | apagar <ref>
  python3 scripts/instagram-automacoes.py disparos [<ref>] [--limite 20]

<ref> = início do id, o nome ou uma das palavras-chave da automação.
Nunca imprime o token de acesso.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import ssl

from migration_db import connect  # também põe pg8000/certifi no sys.path
import certifi

# O Python do python.org no Mac não usa os certificados do sistema.
SSL_CTX = ssl.create_default_context(cafile=certifi.where())

GRAPH = 'https://graph.instagram.com/v23.0'
ADMIN_EMAIL = 'eu.daviqueiroz22@gmail.com'  # mesmo de src/lib/admin.ts


def http(metodo, url, params=None):
    if params:
        url = f'{url}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get('error', {}).get('message')
        except Exception:
            msg = None
        raise SystemExit(f'ERRO da Meta ({e.code}): {msg or e.reason}')


def conexao(q):
    q.execute('select ig_user_id, user_id, username, access_token, token_expira_em from instagram_conexoes order by criado_em limit 1')
    return q.fetchone()


def dono(q):
    c = conexao(q)
    if c:
        return c[1]
    q.execute('select id from auth.users where lower(email) = %s', (ADMIN_EMAIL,))
    row = q.fetchone()
    if not row:
        raise SystemExit('Não achei o usuário dono.')
    return row[0]


def exigir_conexao(q):
    c = conexao(q)
    if not c:
        raise SystemExit('Instagram não conectado. Rode: python3 scripts/instagram-automacoes.py conectar')
    return c


def resolver_posts(q, refs):
    """Aceita id numérico ou link (…/p/CODIGO/ ou …/reel/CODIGO/)."""
    if not refs:
        return None
    ids, links = [], []
    for r in refs:
        (ids if r.strip().isdigit() else links).append(r.strip())
    if links:
        ig_id, _, _, token, _ = exigir_conexao(q)
        midias = listar_midias(ig_id, token, 100)
        for link in links:
            codigo = link.rstrip('/').split('?')[0].rstrip('/').split('/')[-1]
            achou = next((m for m in midias if codigo and codigo in (m.get('permalink') or '')), None)
            if not achou:
                raise SystemExit(f'Não achei o post {link} entre os 100 mais recentes.')
            ids.append(achou['id'])
    return ids


def listar_midias(ig_id, token, limite):
    dados = http('GET', f'{GRAPH}/{ig_id}/media', {
        'fields': 'id,caption,media_product_type,permalink,timestamp,comments_count',
        'limit': limite, 'access_token': token,
    })
    return dados.get('data', [])


def achar(q, ref):
    q.execute('select id, nome, palavras_chave from instagram_automacoes where user_id = %s', (dono(q),))
    alvo = ref.strip().lower()
    achados = [r for r in q.fetchall() if str(r[0]).startswith(alvo) or r[1].lower() == alvo
               or alvo in [p.lower() for p in r[2]]]
    if not achados:
        raise SystemExit(f'Nenhuma automação bate com "{ref}".')
    if len(achados) > 1:
        raise SystemExit('Mais de uma automação bate: ' + ', '.join(f'{str(a[0])[:8]} {a[1]}' for a in achados))
    return achados[0][0]


GATILHOS = ('comentario', 'dm', 'story')


def gatilhos(texto):
    lista = [g.strip().lower() for g in texto.split(',') if g.strip()]
    invalidos = [g for g in lista if g not in GATILHOS]
    if invalidos or not lista:
        raise SystemExit(f'Gatilho inválido: {", ".join(invalidos) or "vazio"}. Use: {", ".join(GATILHOS)}')
    return lista


def palavras(texto):
    return [p.strip() for p in texto.split(',') if p.strip()]


def cmd_status(q, _a):
    c = conexao(q)
    if not c:
        print('Instagram: NÃO conectado.')
    else:
        ig_id, _, username, token, expira = c
        print(f'Instagram: @{username} (id {ig_id})')
        print(f'Token expira em: {expira.isoformat() if expira else "desconhecido"} (a função renova sozinha)')
        assin = http('GET', f'{GRAPH}/me/subscribed_apps', {'access_token': token})
        campos = sorted({f for app in assin.get('data', []) for f in app.get('subscribed_fields', [])})
        print('Webhook inscrito em:', ', '.join(campos) or 'NADA (rode conectar de novo)')
    q.execute('select count(*) filter (where ativo), count(*) from instagram_automacoes')
    ativas, total = q.fetchone()
    print(f'Automações: {ativas} ativas de {total}')


def cmd_conectar(q, _a):
    token = getpass.getpass('Cole o token de acesso do Instagram (não aparece na tela): ').strip()
    if not token:
        raise SystemExit('Token vazio.')
    eu = http('GET', f'{GRAPH}/me', {'fields': 'user_id,username', 'access_token': token})
    ig_id = str(eu.get('user_id') or eu.get('id'))
    # O token gerado no painel da Meta já é de longa duração (60 dias), mas só
    # pode ser renovado depois de 24h; se a renovação falhar, assume 60 dias.
    try:
        novo = http('GET', 'https://graph.instagram.com/refresh_access_token',
                    {'grant_type': 'ig_refresh_token', 'access_token': token})
        token = novo.get('access_token', token)
        segundos = int(novo.get('expires_in', 0) or 0) or 60 * 24 * 3600
    except SystemExit:
        segundos = 60 * 24 * 3600
    expira = datetime.now(timezone.utc) + timedelta(seconds=segundos)
    user_id = dono(q)
    q.execute("""insert into instagram_conexoes (ig_user_id, user_id, username, access_token, token_expira_em)
                 values (%s, %s, %s, %s, %s)
                 on conflict (ig_user_id) do update set username = excluded.username,
                   access_token = excluded.access_token, token_expira_em = excluded.token_expira_em,
                   token_atualizado_em = now()""",
              (ig_id, user_id, eu.get('username'), token, expira))
    http('POST', f'{GRAPH}/me/subscribed_apps', {'subscribed_fields': 'comments,messages', 'access_token': token})
    print(f'Conectado: @{eu.get("username")} (id {ig_id}). Webhook de comentários e mensagens inscrito.')


def cmd_posts(q, a):
    ig_id, _, _, token, _ = exigir_conexao(q)
    for m in listar_midias(ig_id, token, a.limite):
        legenda = (m.get('caption') or '').replace('\n', ' ')[:70]
        print(f"{m['id']}  {m.get('media_product_type', ''):6} {m.get('timestamp', '')[:10]}  "
              f"{m.get('comments_count', 0):>4} coment.  {m.get('permalink', '')}  {legenda}")


def cmd_listar(q, _a):
    q.execute("""select id, nome, ativo, palavras_chave, correspondencia, mensagem_dm,
                        respostas_comentario, media_ids, disparos, gatilhos
                 from instagram_automacoes where user_id = %s order by criado_em""", (dono(q),))
    linhas = q.fetchall()
    if not linhas:
        print('Nenhuma automação.')
    for i, nome, ativo, pal, corr, dm, resp, midias, disp, gat in linhas:
        print(f"[{str(i)[:8]}] {nome} — {'ATIVA' if ativo else 'pausada'} — {disp} DMs enviadas")
        print(f"   palavras ({corr}): {', '.join(pal)}")
        print(f"   gatilhos: {', '.join(gat)}")
        print(f"   posts: {', '.join(midias) if midias else 'todos'}")
        print(f"   DM: {dm}")
        for r in resp:
            print(f"   resposta pública: {r}")


def cmd_criar(q, a):
    if not (a.nome and a.palavras and a.dm):
        raise SystemExit('criar precisa de --nome, --palavras e --dm.')
    q.execute("""insert into instagram_automacoes
                   (user_id, nome, palavras_chave, correspondencia, mensagem_dm, respostas_comentario, media_ids, ativo, gatilhos)
                 values (%s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
              (dono(q), a.nome, palavras(a.palavras), 'exata' if a.exata else 'contem', a.dm,
               a.resposta or [], resolver_posts(q, a.post), not a.pausada, gatilhos(a.gatilhos or 'comentario')))
    print(f'Criada: [{str(q.fetchone()[0])[:8]}] {a.nome}')


def cmd_editar(q, a):
    alvo = achar(q, a.ref)
    sets, vals = [], []
    if a.nome:
        sets.append('nome = %s'); vals.append(a.nome)
    if a.palavras:
        sets.append('palavras_chave = %s'); vals.append(palavras(a.palavras))
    if a.exata:
        sets.append("correspondencia = 'exata'")
    if a.contem:
        sets.append("correspondencia = 'contem'")
    if a.dm:
        sets.append('mensagem_dm = %s'); vals.append(a.dm)
    if a.resposta:
        sets.append('respostas_comentario = %s'); vals.append(a.resposta)
    if a.sem_resposta:
        sets.append("respostas_comentario = '{}'")
    if a.post:
        sets.append('media_ids = %s'); vals.append(resolver_posts(q, a.post))
    if a.gatilhos:
        sets.append('gatilhos = %s'); vals.append(gatilhos(a.gatilhos))
    if a.todos_posts:
        sets.append('media_ids = null')
    if not sets:
        raise SystemExit('Nada para editar.')
    q.execute(f"update instagram_automacoes set {', '.join(sets)}, atualizado_em = now() where id = %s",
              (*vals, alvo))
    print(f'Editada: {str(alvo)[:8]}')


def cmd_estado(ativo):
    def run(q, a):
        alvo = achar(q, a.ref)
        q.execute('update instagram_automacoes set ativo = %s, atualizado_em = now() where id = %s', (ativo, alvo))
        print(f"{'Ativada' if ativo else 'Pausada'}: {str(alvo)[:8]}")
    return run


def cmd_apagar(q, a):
    alvo = achar(q, a.ref)
    q.execute('delete from instagram_automacoes where id = %s returning nome', (alvo,))
    print(f'Apagada: {q.fetchone()[0]} (o histórico de disparos fica)')


def cmd_disparos(q, a):
    filtro, vals = 'd.user_id = %s', [dono(q)]
    if a.ref:
        filtro += ' and d.automacao_id = %s'; vals.append(achar(q, a.ref))
    q.execute(f"""select d.criado_em, coalesce(a.nome, '(apagada)'), d.origem, coalesce('@' || d.autor_username, d.autor_id), d.texto,
                         d.dm_status, d.resposta_status, d.erro, d.cliques, d.respondeu_em is not null
                  from instagram_automacao_disparos d
                  left join instagram_automacoes a on a.id = d.automacao_id
                  where {filtro} order by d.criado_em desc limit %s""", (*vals, a.limite))
    for quando, nome, origem, autor, texto, dm, resp, erro, cliques, respondeu in q.fetchall():
        print(f"{quando:%d/%m %H:%M}  {nome}  [{origem}] {autor}: {texto!r}  DM={dm} resposta={resp}"
              + (f'  cliques={cliques}' if cliques else '') + ('  RESPONDEU' if respondeu else '') + (f'  ERRO: {erro}' if erro else ''))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('status')
    sub.add_parser('conectar')
    sp = sub.add_parser('posts'); sp.add_argument('--limite', type=int, default=15)
    sub.add_parser('listar')
    for nome in ('criar', 'editar'):
        sp = sub.add_parser(nome)
        if nome == 'editar':
            sp.add_argument('ref')
            sp.add_argument('--contem', action='store_true')
            sp.add_argument('--todos-posts', action='store_true')
            sp.add_argument('--sem-resposta', action='store_true')
        else:
            sp.add_argument('--pausada', action='store_true')
        sp.add_argument('--nome')
        sp.add_argument('--palavras', help='separadas por vírgula')
        sp.add_argument('--dm')
        sp.add_argument('--resposta', action='append', help='resposta pública; repita para variar')
        sp.add_argument('--post', action='append', help='id ou link; repita para vários')
        sp.add_argument('--exata', action='store_true')
        sp.add_argument('--gatilhos', help='comentario,dm,story (vírgula)')
    for nome in ('pausar', 'ativar', 'apagar'):
        sub.add_parser(nome).add_argument('ref')
    sp = sub.add_parser('disparos'); sp.add_argument('ref', nargs='?'); sp.add_argument('--limite', type=int, default=20)
    a = p.parse_args()

    comandos = {
        'status': cmd_status, 'conectar': cmd_conectar, 'posts': cmd_posts, 'listar': cmd_listar,
        'criar': cmd_criar, 'editar': cmd_editar, 'pausar': cmd_estado(False), 'ativar': cmd_estado(True),
        'apagar': cmd_apagar, 'disparos': cmd_disparos,
    }
    c = connect()
    try:
        q = c.cursor()
        comandos[a.cmd](q, a)
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


if __name__ == '__main__':
    main()
