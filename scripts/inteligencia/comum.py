"""Leitura da inteligência dos funcionários (somente leitura no banco).
A escrita do Mac vai só pela RPC `inteligencia_concluir`, com a chave pública
e o token de cada item (ver supabase/migrations/20261014130000_inteligencia_membros.sql)."""
import json
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402


def consultar(sql, params=()):
    c = connect()
    try:
        q = c.cursor()
        q.execute('SET TRANSACTION READ ONLY')
        q.execute(sql, params)
        cols = [d[0] for d in q.description]
        return [dict(zip(cols, r)) for r in q.fetchall()]
    finally:
        c.rollback()
        c.close()


def _env():
    vals = {}
    for linha in (RAIZ / '.env').read_text().splitlines():
        if '=' in linha and not linha.lstrip().startswith('#'):
            k, v = linha.split('=', 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals['VITE_SUPABASE_URL'].rstrip('/'), vals['VITE_SUPABASE_PUBLISHABLE_KEY']


def concluir(item_id, token, status, conteudo=None, mensagem=None):
    url, chave = _env()
    corpo = json.dumps({'p_id': str(item_id), 'p_token': str(token), 'p_status': status,
                        'p_conteudo': conteudo, 'p_mensagem': mensagem}).encode()
    req = urllib.request.Request(f'{url}/rest/v1/rpc/inteligencia_concluir', data=corpo, method='POST', headers={
        'apikey': chave, 'Authorization': f'Bearer {chave}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60, context=_ssl()) as r:
        return json.loads(r.read() or b'false')


def _ssl():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()
