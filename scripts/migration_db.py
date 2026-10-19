"""Shared connection setup for this project migration; never logs credentials."""
from pathlib import Path
import socket
import ssl
import sys
import threading
import time

# Bibliotecas (pg8000, certifi): ~/.infopro-hub/py é fixa (o ouvinte do
# Jarvis roda sozinho e sobrevive a reinício); /private/tmp é a antiga.
sys.path.insert(0, '/private/tmp/infopro-db-check')
sys.path.insert(0, str(Path.home() / '.infopro-hub' / 'py'))
import pg8000.dbapi
import certifi

values = {}
for line in (Path(__file__).resolve().parents[1] / '.env.migration.local').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        values[key.strip()] = value

host = values.get('PGHOST', '')
user = values.get('PGUSER', '')
if not (host.endswith('.pooler.supabase.com') and user == 'postgres.ucjyobemrxqfcoopkcgb'):
    print('CONFIG_INVALID: confira o host do Session pooler e o usuário do novo projeto.')
    sys.exit(2)
if not values.get('PGPASSWORD'):
    print('PASSWORD_EMPTY')
    sys.exit(2)

def _connect_uma_vez(porta=None):
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    ssl_context.load_verify_locations(
        cafile=str(Path(__file__).resolve().parents[1] / 'prod-ca-2021.crt')
    )
    # Supabase's legacy 2021 CA lacks extensions required by Python 3.13+
    # strict mode. Keep certificate-chain and hostname verification enabled.
    ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return pg8000.dbapi.connect(
        host=host, port=porta or int(values.get('PGPORT', '5432')),
        database=values.get('PGDATABASE', 'postgres'), user=user,
        # 30 s (era 15): o pooler às vezes demora e dava "read operation timed out".
        password=values['PGPASSWORD'], timeout=30,
        ssl_context=ssl_context,
    )


def _conectar(tentativas, porta=None):
    for n in range(tentativas):
        try:
            return _connect_uma_vez(porta)
        except (pg8000.dbapi.InterfaceError, ssl.SSLError, OSError):
            if n == tentativas - 1:
                raise
            time.sleep(2 ** n)


# Conexão reaproveitada (16/10, melhoria do Pedro): o ouvinte abria uma conexão
# nova a cada volta de cada laço (~40 por minuto, 1 a 1,6 s cada) e, quando o
# pooler oscilava, todos os fluxos caíam juntos. Agora a thread que chama
# reusar_nesta_thread() guarda UMA conexão e só reconecta quando ela cai.
# Scripts comuns (que não chamam) continuam abrindo e fechando como antes.
_local = threading.local()
OCIOSA_S = 30
PORTA_TRANSACAO = 6543   # parada há mais que isso: confere com SELECT 1 antes de usar


def reusar_nesta_thread():
    _local.reusar = True


def _fechar_quieto(conexao):
    try:
        conexao.close()
    except Exception:
        pass


class _ConexaoReusada:
    """Mesma cara da conexão do pg8000; close() só desfaz o que ficou aberto e
    devolve a conexão para a próxima volta do laço."""

    def __init__(self, real):
        self._real = real
        self._fechada = False

    def __getattr__(self, nome):
        return getattr(self._real, nome)

    def close(self):
        if self._fechada:
            return
        self._fechada = True
        _local.em_uso = False
        _local.usada_em = time.monotonic()
        try:
            self._real.rollback()
        except Exception:   # caiu no meio: a próxima volta reconecta
            _local.conexao = None
            _fechar_quieto(self._real)


def _reusada(tentativas):
    real = getattr(_local, 'conexao', None)
    if real is not None and time.monotonic() - getattr(_local, 'usada_em', 0) > OCIOSA_S:
        try:
            q = real.cursor()
            q.execute('SELECT 1')
            q.fetchall()
            real.rollback()
        except Exception:   # o pooler fechou a conexão parada
            _fechar_quieto(real)
            real = None
    if real is None:
        _local.conexao = None
        # 19/10: a conexão guardada da thread (ouvinte, serviços) fica aberta o tempo todo; no Session
        # pooler (15 vagas) elas enchiam tudo e o receptor do WhatsApp perdia mensagens ("max clients
        # reached"). Vão pelo Transaction pooler (6543), que aguenta muitas conexões paradas.
        real = _conectar(tentativas, PORTA_TRANSACAO)
        _local.conexao = real
    _local.em_uso = True
    return _ConexaoReusada(real)


def connect(tentativas=4):
    """Conecta com novas tentativas: o pooler às vezes derruba o handshake
    (SSL EOF, "network error", connection reset). Espera 1s, 2s, 4s.
    Na thread que pediu reuso, devolve a conexão guardada dela (se já estiver
    em uso, por uma chamada dentro de outra, abre uma à parte, como antes)."""
    if getattr(_local, 'reusar', False) and not getattr(_local, 'em_uso', False):
        return _reusada(tentativas)
    return _conectar(tentativas)


def eh_falha_de_conexao(erro):
    """Banco/pooler fora (não é erro de SQL)."""
    return isinstance(erro, (pg8000.dbapi.InterfaceError, ssl.SSLError, OSError))
