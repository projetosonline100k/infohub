"""Check the new database credentials without printing secrets or changing data."""
from pathlib import Path
import socket
import ssl
import sys

sys.path.insert(0, '/private/tmp/infopro-db-check')
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
connection = None
try:
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    ssl_context.load_verify_locations(
        cafile=str(Path(__file__).resolve().parents[1] / 'prod-ca-2021.crt')
    )
    # Supabase's legacy 2021 CA lacks extensions required by Python 3.13+
    # strict mode. Keep certificate-chain and hostname verification enabled.
    ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    connection = pg8000.dbapi.connect(
        host=host, port=int(values.get('PGPORT', '5432')),
        database=values.get('PGDATABASE', 'postgres'), user=user,
        password=values['PGPASSWORD'], timeout=15,
        ssl_context=ssl_context,
    )
    cursor = connection.cursor()
    cursor.execute('SELECT 1')
    assert cursor.fetchone()[0] == 1
    connection.rollback()
    print('CONNECTION_OK: autenticação aceita; consulta somente de leitura concluída.')
except Exception as exc:
    # Never print raw exceptions: drivers may include connection parameters.
    detail = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
    code = detail.get('C', '')
    chain = []
    cause = exc
    while cause and len(chain) < 5:
        chain.append(cause)
        cause = cause.__cause__ or cause.__context__
    if code in ('28P01', '28000'):
        print('AUTH_FAILED: o servidor recusou a autenticação.')
    elif any(isinstance(e, ssl.SSLError) for e in chain):
        print('TLS_FAILED: não foi possível validar o certificado do servidor.')
        for e in chain:
            if isinstance(e, ssl.SSLCertVerificationError):
                print('CERT_VERIFY_CODE=' + str(e.verify_code))
    elif any(isinstance(e, (socket.gaierror, ConnectionError, TimeoutError, PermissionError)) for e in chain):
        print('NETWORK_FAILED: conexão bloqueada, indisponível ou sem resolução de endereço.')
    else:
        print('CONNECTION_FAILED: ' + type(exc).__name__ + (' SQLSTATE=' + code if code else ''))
    sys.exit(1)
finally:
    if connection is not None:
        connection.close()
