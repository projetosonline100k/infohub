"""Kanban de melhorias do Infopro (Pedro, IA de melhorias — pedido do Davi, 15/10/2026).
Ideias → Pode fazer (o Davi arrasta) → Fazendo (o Pedro implementa sozinho) → Feito.

  python3 scripts/pedro/melhorias.py listar                       → o quadro todo
  python3 scripts/pedro/melhorias.py propor <<'FIM'               → novas ideias (lista JSON; pula título repetido)
  [{"titulo": "...", "problema": "...", "porque": "...", "sugestao": "...", "impacto": 1-3, "esforco": 1-3}]
  FIM
  python3 scripts/pedro/melhorias.py contexto <id>                → a ideia que está implementando
  python3 scripts/pedro/melhorias.py progresso <id> <0-100> "<o que está fazendo>"
  python3 scripts/pedro/melhorias.py pronto <id> "<resumo de 1 linha>" <<'FIM'
  <briefing pro Davi: o que mudou · onde fica no app · como usar (passo a passo) · o que testar · limites>
  FIM
  python3 scripts/pedro/melhorias.py erro <id> "<por que não deu>"
  (o ouvinte usa: pegar, situacao, feito)"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

CLIENTE = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'   # projeto Davi Queiroz (onde o Pedro é IA)


def _q(sql, args=(), um=False, commit=False):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        r = (q.fetchone() if um else q.fetchall()) if q.description else None
        if commit:
            c.commit()
        return r
    finally:
        c.close()


def listar():
    for st, titulo, imp, esf, mid in _q("""SELECT status, titulo, impacto, esforco, id FROM melhorias_sistema WHERE cliente_id = %s
                                             ORDER BY array_position(ARRAY['fazendo','pode_fazer','ideia','erro','feito','descartada'], status), ordem, criado_em""", (CLIENTE,)):
        print(f'[{st}] {titulo} (impacto {imp or "-"}, esforço {esf or "-"}) · {mid}')


def propor(bruto):
    try:
        ideias = json.loads(bruto)
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    if isinstance(ideias, dict):
        ideias = [ideias]
    existentes = {t.strip().lower() for (t,) in _q("SELECT titulo FROM melhorias_sistema WHERE cliente_id = %s AND status <> 'descartada'", (CLIENTE,))}
    novas = 0
    c = connect()
    try:
        q = c.cursor()
        for i in ideias:
            t = str(i.get('titulo', '')).strip()
            if not t or t.lower() in existentes:
                continue
            imp = i.get('impacto'); esf = i.get('esforco')
            q.execute("""INSERT INTO melhorias_sistema (cliente_id, user_id, titulo, problema, porque, sugestao, impacto, esforco, origem)
                         SELECT %s, c.user_id, %s, %s, %s, %s, %s, %s, 'pedro' FROM clientes c WHERE c.id = %s""",
                      (CLIENTE, t[:160], i.get('problema'), i.get('porque'), i.get('sugestao'),
                       imp if imp in (1, 2, 3) else None, esf if esf in (1, 2, 3) else None, CLIENTE))
            existentes.add(t.lower())
            novas += 1
        c.commit()
    finally:
        c.close()
    print(f'PROPOSTAS {novas}')


def pegar():
    r = _q("""UPDATE melhorias_sistema SET status = 'fazendo', progresso = 5, agora = 'começando', resultado = NULL
               WHERE id = (SELECT id FROM melhorias_sistema WHERE cliente_id = %s AND status = 'pode_fazer'
                            ORDER BY ordem, criado_em LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING id""", (CLIENTE,), um=True, commit=True)
    return str(r[0]) if r else None


def contexto(mid):
    r = _q("SELECT titulo, problema, porque, sugestao, impacto, esforco, origem, notas FROM melhorias_sistema WHERE id = %s", (mid,), um=True)
    if not r:
        raise SystemExit('melhoria não encontrada')
    t, p, pq, s, i, e, o, notas = r
    print(f'Melhoria aprovada pelo Davi: {t}\nVeio de: {"ideia do Davi" if o == "davi" else "ideia sua (Pedro)"} · impacto {i or "-"} · esforço {e or "-"}')
    print(f'Problema: {p or "-"}\nPor que importa: {pq or "-"}\nSugestão: {s or "-"}')
    if notas:
        print(f'\nDETALHES DO DAVI (valem mais que a sugestão; siga):\n{notas}')


def progresso(mid, pct, agora):
    _q("UPDATE melhorias_sistema SET progresso = %s, agora = %s WHERE id = %s AND status = 'fazendo'",
       (max(5, min(95, int(pct))), agora.strip()[:200], mid), commit=True)
    print('OK')


def pronto(mid, resumo, briefing=''):
    """`briefing` (stdin): o que o Davi lê no kanban — o que mudou, onde fica, como usar, o que testar, limites."""
    if len((briefing or '').strip()) < 120:
        raise SystemExit('Faltou o briefing pro Davi (mande pelo stdin, com as seções do manual: o que mudou, onde fica, como usar, o que testar, limites).')
    _q("UPDATE melhorias_sistema SET progresso = 95, agora = 'juntando no sistema', resultado = %s, briefing = %s WHERE id = %s AND status = 'fazendo'",
       (resumo.strip()[:2000], briefing.strip()[:12000], mid), commit=True)
    print('PRONTO (o ouvinte junta no sistema)')


def erro(mid, motivo):
    _q("UPDATE melhorias_sistema SET status = 'erro', agora = NULL, resultado = %s WHERE id = %s",
       (motivo.strip()[:2000], mid), commit=True)
    print('ERRO REGISTRADO')


def feito(mid, sha):
    _q("UPDATE melhorias_sistema SET status = 'feito', progresso = 100, agora = NULL, commit_sha = %s WHERE id = %s",
       (sha, mid), commit=True)


def reenfileirar():
    """Ao ligar o ouvinte: melhoria que estava em "fazendo" volta pra "pode_fazer"."""
    r = _q("UPDATE melhorias_sistema SET status = 'pode_fazer', agora = NULL, progresso = NULL WHERE status = 'fazendo' RETURNING id", commit=True)
    return len(r or [])


def situacao(mid):
    r = _q("SELECT status, resultado, agora FROM melhorias_sistema WHERE id = %s", (mid,), um=True)
    return r


if __name__ == '__main__':
    a = sys.argv[1:]
    cmd = a[0] if a else ''
    if cmd == 'listar':
        listar()
    elif cmd == 'propor':
        propor(sys.stdin.read())
    elif cmd == 'contexto' and len(a) > 1:
        contexto(a[1])
    elif cmd == 'progresso' and len(a) > 3:
        progresso(a[1], a[2], a[3])
    elif cmd == 'pronto' and len(a) > 2:
        pronto(a[1], a[2], sys.stdin.read() if not sys.stdin.isatty() else '')
    elif cmd == 'erro' and len(a) > 2:
        erro(a[1], a[2])
    elif cmd == 'pegar':
        print(json.dumps(pegar()))
    else:
        print(__doc__)
        sys.exit(1)
