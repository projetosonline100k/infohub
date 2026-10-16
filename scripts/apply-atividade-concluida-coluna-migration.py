"""Aplica 20261016150000_atividade_concluida_vai_para_coluna e roda todos os testes SQL.
`--testar` faz tudo e desfaz no fim (nada gravado).
Teste que já falhava antes da migração (ex.: migração de outro chat ainda
não aplicada) é avisado, mas não trava; só trava falha nova."""
from pathlib import Path
import re
import sys
from migration_db import connect

root = Path(__file__).resolve().parents[1]
version = '20261016150000'
name = 'atividade_concluida_vai_para_coluna'
sql = (root / 'supabase/migrations' / f'{version}_{name}.sql').read_text()
testar = '--testar' in sys.argv
tests = sorted(p.name for p in (root / 'supabase/tests').glob('*.sql'))


def rodar_testes(q):
    falhas = {}
    for test in tests:
        test_sql = (root / 'supabase/tests' / test).read_text()
        q.execute('SAVEPOINT regression')
        try:
            q.execute(re.sub(r'^(?:BEGIN|ROLLBACK);\s*$', '', test_sql, flags=re.M))
        except Exception as e:
            d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
            falhas[test] = d.get('M')
        q.execute('ROLLBACK TO SAVEPOINT regression')
    return falhas


c = connect()
phase = 'migration'
try:
    q = c.cursor()
    antes = rodar_testes(q)
    q.execute(sql)
    phase = 'testes'
    depois = rodar_testes(q)
    for test in tests:
        if test not in depois:
            print('TEST_OK', test, flush=True)
        elif test in antes:
            print('TEST_JA_FALHAVA', test, depois[test], flush=True)
    novas = {t: m for t, m in depois.items() if t not in antes}
    if novas:
        raise RuntimeError({'C': 'TESTE', 'M': '; '.join(f'{t}: {m}' for t, m in novas.items())})
    if testar:
        c.rollback()
        print('CONCLUIDA_COLUNA_TESTADA (nada gravado)')
        sys.exit(0)
    phase = 'record_migration'
    q.execute(
        'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (%s,%s,%s) ON CONFLICT (version) DO NOTHING',
        (version, name, [sql]),
    )
    q.execute("NOTIFY pgrst, 'reload schema'")
    c.commit()
    print('CONCLUIDA_COLUNA_APPLIED')
except Exception as e:
    c.rollback()
    d = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    print('FAILED', phase, d.get('C'), d.get('M'))
    sys.exit(1)
finally:
    c.close()
