"""Switch banner references only after every uploaded file has been verified."""
from pathlib import Path
import json
import sys
from migration_db import connect
root = Path(__file__).resolve().parents[1] / '.migration.local'
manifest = json.loads((root / 'storage-manifest.json').read_text())
result = json.loads((root / 'storage-result.json').read_text())
assert result['verified'] == len(manifest) == 7
old = 'https://ofnhmqhycahbygfadubd.supabase.co/storage/v1/object/public/'
new = 'https://ucjyobemrxqfcoopkcgb.supabase.co/storage/v1/object/public/'
conn = connect()
try:
    cur = conn.cursor()
    cur.execute('UPDATE public.pesquisas SET banner_url = replace(banner_url, %s, %s) WHERE starts_with(banner_url, %s)', (old, new, old))
    count = cur.rowcount
    cur.execute('SELECT count(*) FROM public.pesquisas WHERE starts_with(banner_url, %s)', (old,))
    assert cur.fetchone()[0] == 0
    conn.commit()
    print('BANNER_URLS_UPDATED:', count)
except Exception as exc:
    conn.rollback()
    detail = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
    print('BANNER_UPDATE_FAILED:', type(exc).__name__, detail.get('C', ''))
    sys.exit(1)
finally:
    conn.close()
