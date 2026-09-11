"""Shared connection setup for this project migration; never logs credentials."""
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

def connect():
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    ssl_context.load_verify_locations(
        cafile=str(Path(__file__).resolve().parents[1] / 'prod-ca-2021.crt')
    )
    # Supabase's legacy 2021 CA lacks extensions required by Python 3.13+
    # strict mode. Keep certificate-chain and hostname verification enabled.
    ssl_context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return pg8000.dbapi.connect(
        host=host, port=int(values.get('PGPORT', '5432')),
        database=values.get('PGDATABASE', 'postgres'), user=user,
        password=values['PGPASSWORD'], timeout=15,
        ssl_context=ssl_context,
    )
