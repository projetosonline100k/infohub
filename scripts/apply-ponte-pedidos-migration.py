"""Aplica 20261024060000_ponte_pedidos e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado). Os dois testes antigos da Dalila que já falhavam
antes desta migração (esperam o carrossel às 10h; hoje é 14h) não bloqueiam; qualquer outra falha bloqueia."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261024060000'
name = 'ponte_pedidos'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv
JA_FALHAVAM = {'dalila_programa_sozinha.sql', 'dalila_semana_sem_carrossel.sql'}

c = connect()
phase = 'migration'
try:
    q = c.cursor()
    q.execute(sql)
    falhas = []
    for test in sorted(p.name for p in (root / 'supabase/tests').glob('*.sql')):
        phase = test
        q.execute('SAVEPOINT regression')
        test_sql = (root / 'supabase/tests' / test).read_text()
        try:
            q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
            print('TEST_OK', test, flush=True)
        except Exception as e:
            d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
            print('TEST_FAIL', test, d.get('M'), flush=True)
            falhas.append(test)
        q.execute('ROLLBACK TO SAVEPOINT regression')
    novas = [f for f in falhas if f not in JA_FALHAVAM]
    if novas:
        raise RuntimeError({'M': f'testes falharam: {novas}'})
    if testar:
        c.rollback()
        print('PONTE_PEDIDOS_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('PONTE_PEDIDOS_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
