"""Esteira de produção de um escritório (pedido do Davi, 17/10/2026): a peça passa de
funcionário em funcionário sozinha. Ex.: Laboratório de Viral — Leo (Headlines) →
Junior (Roteiro) → Elias (Revisão) → pronto para o Davi.

O ouvinte chama `andar()` a cada minuto: cada peça na fila da etapa vira uma tarefa
de quem é a vez (o fluxo de execução de sempre pega e o funcionário trabalha).
O funcionário, no lugar do `execucao.py entregar`, usa:

  python3 scripts/empresa/esteira.py contexto <peca_id>                 → a peça, o que as etapas anteriores fizeram, notas
  python3 scripts/empresa/esteira.py entregar <peca_id> <<'FIM'         → grava o seu texto e passa para a próxima etapa
  <o seu texto: headline / roteiro / revisão>
  FIM
  python3 scripts/empresa/esteira.py novas <peca_id> <<'FIM'            → (1ª etapa) várias headlines a partir de uma ideia:
  ["headline 1", "headline 2"]                                            cada uma vira uma peça na etapa seguinte
  FIM
  python3 scripts/empresa/esteira.py devolver <peca_id> "<o que ajustar>"  → (revisão) volta para a etapa anterior, com a nota
  python3 scripts/empresa/esteira.py ideia <setor_id> "<ideia ou pedido>"   → nova peça na 1ª etapa (pedido do Davi no chat)
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

MARCA = 'ESTEIRA:'   # na descrição da tarefa: ESTEIRA:<peca_id>:<etapa>


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


def _peca(pid):
    r = _q("""SELECT p.id, p.cliente_id, p.setor_id, p.titulo, p.textos, p.etapa, p.situacao, p.nota, p.atividade_id,
                     s.nome, s.esteira
                FROM esteira_itens p JOIN setores s ON s.id = p.setor_id WHERE p.id = %s""", (pid,), um=True)
    if not r:
        raise SystemExit('peça não encontrada')
    return dict(zip(['id', 'cliente_id', 'setor_id', 'titulo', 'textos', 'etapa', 'situacao', 'nota', 'atividade_id', 'setor', 'esteira'], r))


def _concluir_tarefa(aid, obs):
    if aid:
        _q("""UPDATE atividades SET situacao = 'concluida', concluida = true, progresso = 100, observacao = %s,
                     status = coalesce((SELECT status_key FROM colunas_atividade c WHERE c.cliente_id = atividades.cliente_id AND c.eh_conclusao ORDER BY ordem LIMIT 1), status)
               WHERE id = %s AND NOT concluida""", (obs[:500], aid), commit=True)


def andar():
    """Peça na fila de uma etapa → tarefa de quem é a vez (uma tarefa por peça e etapa)."""
    linhas = _q("""SELECT p.id, p.cliente_id, p.titulo, p.etapa, p.nota, s.nome, s.esteira, c.user_id
                     FROM esteira_itens p JOIN setores s ON s.id = p.setor_id JOIN clientes c ON c.id = p.cliente_id
                    WHERE p.situacao = 'fila' AND s.esteira IS NOT NULL
                      AND p.etapa < jsonb_array_length(s.esteira)
                    ORDER BY p.ordem, p.criado_em LIMIT 20""")
    n = 0
    for pid, cid, titulo, etapa, nota, setor, esteira, dono in linhas or []:
        e = esteira[etapa]
        m = _q("SELECT id, setor_id, nome FROM membros WHERE id = %s AND ativo", (e['membro_id'],), um=True)
        if not m:
            continue
        col = _q("SELECT status_key FROM colunas_atividade WHERE cliente_id = %s AND NOT eh_conclusao ORDER BY ordem LIMIT 1", (cid,), um=True)
        desc = (f"{MARCA}{pid}:{etapa}\nEsteira do {setor} · etapa {etapa + 1} de {len(esteira)}: {e['nome']}.\n"
                f"Peça: {titulo}\n" + (f"Nota (ajuste pedido): {nota}\n" if nota else '') +
                "Faça a sua parte e passe adiante com scripts/empresa/esteira.py (não use o entregar).")
        r = _q("""INSERT INTO atividades (titulo, cliente_id, user_id, data_atividade, status, concluida, ordem, prioridade,
                                          responsavel_id, setor_id, situacao, tipo, descricao)
                  VALUES (%s, %s, %s, current_date, %s, false, 0, 'media', %s, %s, 'fila', 'copy', %s) RETURNING id""",
               (f"{e['nome']}: {titulo}"[:300], cid, dono, col[0] if col else 'backlog', m[0], m[1], desc), um=True, commit=True)
        _q("UPDATE esteira_itens SET situacao = 'fazendo', atividade_id = %s WHERE id = %s AND situacao = 'fila'", (r[0], pid), commit=True)
        n += 1
    return n


def contexto(pid):
    p = _peca(pid)
    etapas = p['esteira'] or []
    print(f"ESTEIRA do escritório {p['setor']} · peça {p['id']}")
    print(f"Título/headline: {p['titulo']}")
    print("Etapas: " + " → ".join(f"{i + 1}. {e['nome']}" for i, e in enumerate(etapas)) + " → pronto para o Davi")
    print(f"Agora: etapa {p['etapa'] + 1} ({etapas[p['etapa']]['nome'] if p['etapa'] < len(etapas) else 'pronto'}), {p['situacao']}")
    if p['nota']:
        print(f"NOTA (ajuste pedido na revisão ou pelo Davi): {p['nota']}")
    for nome, texto in (p['textos'] or {}).items():
        print(f"\n--- {nome} ---\n{texto}")
    print("\nComo entregar: python3 scripts/empresa/esteira.py entregar <peça> (texto pelo stdin). "
          "Na 1ª etapa, várias headlines de uma ideia: esteira.py novas <peça> (JSON). Na revisão, para voltar: esteira.py devolver <peça> \"<o que ajustar>\".")


def entregar(pid, texto):
    p = _peca(pid)
    etapas = p['esteira'] or []
    if p['etapa'] >= len(etapas):
        raise SystemExit('a peça já está pronta')
    nome = etapas[p['etapa']]['nome']
    textos = dict(p['textos'] or {})
    textos[nome] = texto.strip()
    titulo = p['titulo']
    if p['etapa'] == 0 and texto.strip():
        titulo = texto.strip().split('\n')[0][:300]   # 1ª etapa: o texto é a headline
    prox = p['etapa'] + 1
    _q("""UPDATE esteira_itens SET textos = %s::jsonb, titulo = %s, etapa = %s, nota = NULL,
                 situacao = %s, atividade_id = NULL WHERE id = %s""",
       (json.dumps(textos, ensure_ascii=False), titulo, prox, 'feito' if prox >= len(etapas) else 'fila', pid), commit=True)
    _concluir_tarefa(p['atividade_id'], f"Passou para {'o Davi (pronto)' if prox >= len(etapas) else etapas[prox]['nome']} na esteira.")
    print('ENTREGUE →', 'pronto para o Davi' if prox >= len(etapas) else etapas[prox]['nome'])


def novas(pid, bruto):
    p = _peca(pid)
    etapas = p['esteira'] or []
    lista = [str(t).strip() for t in json.loads(bruto or '[]') if str(t).strip()]
    if not lista:
        raise SystemExit('mande a lista de headlines (JSON)')
    nome = etapas[0]['nome'] if etapas else 'Headlines'
    for i, h in enumerate(lista):
        _q("""INSERT INTO esteira_itens (cliente_id, setor_id, titulo, textos, etapa, situacao, ordem)
              VALUES (%s, %s, %s, %s::jsonb, 1, 'fila', %s)""",
           (p['cliente_id'], p['setor_id'], h[:300], json.dumps({nome: h, 'Ideia': p['titulo']}, ensure_ascii=False), i), commit=True)
    # A ideia virou as headlines: o cartão dela sai do quadro.
    _q("UPDATE esteira_itens SET situacao = 'descartado', atividade_id = NULL, nota = %s WHERE id = %s",
       (f'Virou {len(lista)} headline(s)', pid), commit=True)
    _concluir_tarefa(p['atividade_id'], f'{len(lista)} headline(s) passadas para a próxima etapa.')
    print(f'{len(lista)} HEADLINES na esteira')


def devolver(pid, motivo):
    p = _peca(pid)
    if p['etapa'] == 0:
        raise SystemExit('já está na 1ª etapa')
    _q("UPDATE esteira_itens SET etapa = etapa - 1, situacao = 'fila', nota = %s, atividade_id = NULL WHERE id = %s",
       (motivo.strip()[:1000], pid), commit=True)
    _concluir_tarefa(p['atividade_id'], f'Devolvida para ajuste: {motivo.strip()[:300]}')
    print('DEVOLVIDA')


def ideia(setor_id, texto):
    """Nova peça na 1ª etapa (ex.: no chat da esteira o Davi pede "Leo, traz 5 headlines sobre X")."""
    r = _q("SELECT cliente_id FROM setores WHERE id = %s AND esteira IS NOT NULL", (setor_id,), um=True)
    if not r:
        raise SystemExit('escritório sem esteira')
    _q("INSERT INTO esteira_itens (cliente_id, setor_id, titulo, etapa, situacao) VALUES (%s, %s, %s, 0, 'fila')",
       (r[0], setor_id, texto.strip()[:300]), commit=True)
    print('IDEIA NA ESTEIRA')


def da_tarefa(aid):
    """A peça e a etapa de uma tarefa da esteira (ou None)."""
    r = _q("SELECT descricao FROM atividades WHERE id = %s", (aid,), um=True)
    d = (r[0] if r else '') or ''
    if not d.startswith(MARCA):
        return None
    pid = d[len(MARCA):].split(':')[0]
    return pid


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    if a[0] == 'andar':
        print(andar())
    elif a[0] == 'contexto' and len(a) > 1:
        contexto(a[1])
    elif a[0] == 'entregar' and len(a) > 1:
        entregar(a[1], sys.stdin.read())
    elif a[0] == 'novas' and len(a) > 1:
        novas(a[1], sys.stdin.read())
    elif a[0] == 'ideia' and len(a) > 2:
        ideia(a[1], a[2])
    elif a[0] == 'devolver' and len(a) > 2:
        devolver(a[1], a[2])
    else:
        raise SystemExit(__doc__)
