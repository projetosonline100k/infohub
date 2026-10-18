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
  python3 scripts/empresa/esteira.py anotado <peca_id> [--so-salvar] <<'FIM'   → roteiro/revisão em trechos com o porquê de cada um
  [{"texto": "trecho", "nota": "por que fiz assim (ou: troquei X por Y porque Z)"}]
  FIM
"""
import json
import re
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
                     s.nome, s.esteira, p.documento_id
                FROM esteira_itens p JOIN setores s ON s.id = p.setor_id WHERE p.id = %s""", (pid,), um=True)
    if not r:
        raise SystemExit('peça não encontrada')
    return dict(zip(['id', 'cliente_id', 'setor_id', 'titulo', 'textos', 'etapa', 'situacao', 'nota', 'atividade_id', 'setor', 'esteira', 'documento_id'], r))


def _para_davi(e):
    """A etapa para e espera o Davi passar adiante? (setores.esteira[i].davi_aprova; padrão: todas, menos a última)."""
    return e.get('davi_aprova', True)


def _html(texto):
    """Texto simples → HTML de documento (parágrafos e listas)."""
    import html as _h
    partes = []
    for bloco in re.split(r'\n\s*\n', texto.strip()):
        linhas = [l for l in bloco.split('\n') if l.strip()]
        if linhas and all(re.match(r'^\s*([-•*]|\d+[.)])\s+', l) for l in linhas):
            itens = ''.join(f"<li>{_h.escape(re.sub(r'^\s*([-•*]|\d+[.)])\s+', '', l))}</li>" for l in linhas)
            partes.append(f"<{'ol' if re.match(r'^\s*\d', linhas[0]) else 'ul'}>{itens}</{'ol' if re.match(r'^\s*\d', linhas[0]) else 'ul'}>")
        elif linhas:
            partes.append('<p>' + '<br>'.join(_h.escape(l.strip()) for l in linhas) + '</p>')
    return ''.join(partes)


def _documento(p, conteudo_html=None):
    """O documento da peça (17/10: "quando passar para o Junior, quero clicar e abrir um docs normal").
    Cria na primeira vez; com conteudo_html, troca o conteúdo."""
    import html as _h
    if p.get('documento_id'):
        if conteudo_html is not None:
            _q("UPDATE documentos SET titulo = %s, conteudo = %s, updated_at = now() WHERE id = %s",
               (p['titulo'][:150], conteudo_html, p['documento_id']), commit=True)
        return p['documento_id']
    dono = _q("SELECT user_id FROM clientes WHERE id = %s", (p['cliente_id'],), um=True)
    pasta = _q("""SELECT pasta_id FROM documentos WHERE cliente_id = %s AND deleted_at IS NULL AND pasta_id IS NOT NULL
                   ORDER BY updated_at DESC LIMIT 1""", (p['cliente_id'],), um=True)
    corpo = conteudo_html if conteudo_html is not None else (
        f"<h2>{_h.escape(p['titulo'])}</h2><h3>Roteiro</h3><p><em>Ainda sendo escrito.</em></p>")
    r = _q("""INSERT INTO documentos (cliente_id, titulo, conteudo, user_id, pasta_id) VALUES (%s, %s, %s, %s, %s) RETURNING id""",
           (p['cliente_id'], p['titulo'][:150], corpo, dono[0] if dono else None, pasta[0] if pasta else None), um=True, commit=True)
    _q("UPDATE esteira_itens SET documento_id = %s WHERE id = %s", (r[0], p['id']), commit=True)
    p['documento_id'] = r[0]
    return r[0]


def _conteudo_doc(did):
    r = _q("SELECT conteudo FROM documentos WHERE id = %s AND deleted_at IS NULL", (did,), um=True)
    return (r[0] if r else '') or ''


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
        if etapa >= 1:
            _documento(_peca(pid))   # a partir do Roteiro a peça tem documento (o Davi abre e acompanha)
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
    if p['etapa'] < len(etapas):
        crit = (etapas[p['etapa']].get('criterios') or '').strip()
        print(f"\nCRITÉRIOS DO DAVI PARA ESTA ETAPA ({etapas[p['etapa']]['nome']}): " + (crit if crit else
              '(ainda não definidos: siga o seu manual e os aprendizados, e na conversa proponha ao Davi os critérios que você usou)'))
    for nome, texto in (p['textos'] or {}).items():
        if nome.startswith('_'):
            continue
        print(f"\n--- {nome} ---\n{texto}")
    for nome, ts in ((p['textos'] or {}).get('_trechos') or {}).items():
        print(f"\n--- {nome} em trechos (com as notas) ---")
        for i, t in enumerate(ts, 1):
            print(f"{i}. {t['texto']}" + (f"\n   [nota: {t['nota']}]" if t.get('nota') else ''))
    if p.get('documento_id'):
        print(f"\n--- DOCUMENTO DA PEÇA (o que vale: o Davi pode ter editado; id {p['documento_id']}) ---\n"
              + re.sub(r'<[^>]+>', ' ', _conteudo_doc(p['documento_id'])).strip())
        print(f"Para reescrever o documento sem passar de etapa (ajuste pedido na conversa): esteira.py reescrever {p['id']} (texto pelo stdin)")
    print("\nComo entregar: python3 scripts/empresa/esteira.py entregar <peça> (texto pelo stdin). "
          "Na 1ª etapa, várias headlines de uma ideia: esteira.py novas <peça> (JSON). Na revisão, para voltar: esteira.py devolver <peça> \"<o que ajustar>\".")


def _headline(texto):
    """A headline do texto do Leo: 1ª linha útil, sem rótulo ("HEADLINE:") nem aspas."""
    for linha in texto.strip().split('\n'):
        l = re.sub(r'^\s*(headline|título|titulo)\s*[:\-]\s*', '', linha.strip(), flags=re.I).strip().strip('"“”').strip()
        if l:
            return l[:300]
    return texto.strip()[:300]


def _quantas(texto):
    """Quantas o Davi pediu ("5 headlines", "me traga 3"): o número do pedido, ou None."""
    m = re.search(r'\b(\d{1,2})\b', texto or '')
    return int(m.group(1)) if m else None


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
        titulo = _headline(texto)   # 1ª etapa: o texto é a headline
    # 17/10 (Davi): "eu que devo arrastar para o Junior começar" — o que sai da 1ª etapa fica
    # esperando na coluna dela (feito) até ele passar adiante; as outras etapas andam sozinhas.
    if p['etapa'] == 0:
        _q("""UPDATE esteira_itens SET textos = %s::jsonb, titulo = %s, nota = NULL, situacao = 'feito', atividade_id = NULL
               WHERE id = %s""", (json.dumps(textos, ensure_ascii=False), titulo, pid), commit=True)
        _concluir_tarefa(p['atividade_id'], 'Headline pronta: esperando o Davi passar adiante.')
        print('ENTREGUE → esperando o Davi passar para a próxima etapa')
        return
    # No documento: a 2ª etapa (Roteiro) escreve o corpo; as seguintes (Revisão) entram no fim.
    import html as _h
    if p['etapa'] == 1:
        _documento(p, f"<h2>{_h.escape(titulo)}</h2>" + _html(texto))
    else:
        atual = _conteudo_doc(_documento(p))
        _documento(p, atual + f"<h3>{_h.escape(nome)} · {_q('SELECT nome FROM membros WHERE id = %s', (etapas[p['etapa']]['membro_id'],), um=True)[0]}</h3>" + _html(texto))
    if _para_davi(etapas[p['etapa']]) and p['etapa'] + 1 < len(etapas):
        # Para e espera o Davi ler/conversar e passar adiante (17/10: "eu queria conseguir ver, conversar com ele").
        _q("""UPDATE esteira_itens SET textos = %s::jsonb, titulo = %s, nota = NULL, situacao = 'feito', atividade_id = NULL WHERE id = %s""",
           (json.dumps(textos, ensure_ascii=False), titulo, pid), commit=True)
        _concluir_tarefa(p['atividade_id'], f'{nome} pronto: esperando o Davi passar adiante.')
        print(f'ENTREGUE → esperando o Davi passar para {etapas[p["etapa"] + 1]["nome"]}')
        return
    prox = p['etapa'] + 1
    _q("""UPDATE esteira_itens SET textos = %s::jsonb, titulo = %s, etapa = %s, nota = NULL,
                 situacao = %s, atividade_id = NULL WHERE id = %s""",
       (json.dumps(textos, ensure_ascii=False), titulo, prox, 'feito' if prox >= len(etapas) else 'fila', pid), commit=True)
    _concluir_tarefa(p['atividade_id'], f"Passou para {'o Davi (pronto)' if prox >= len(etapas) else etapas[prox]['nome']} na esteira.")
    print('ENTREGUE →', 'pronto para o Davi' if prox >= len(etapas) else etapas[prox]['nome'])


def anotado(pid, bruto, so_salvar=False):
    """Roteiro ou revisão em TRECHOS anotados (17/10, Davi: "preciso saber o que foi pensado, o
    que o Elias ajustou"). stdin: [{"texto": "...", "nota": "por que fiz assim / o que mudei e por quê"}].
    Na revisão, mande os MESMOS trechos do roteiro, na mesma ordem (com nota só onde mudou).
    Grava o texto corrido (e o documento) como no entregar; so_salvar: sem passar de etapa (ajuste na conversa)."""
    try:
        lista = json.loads(bruto or '[]')
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    trechos = [{'texto': str(t.get('texto', '')).strip(), 'nota': (str(t.get('nota')).strip() or None) if t.get('nota') else None}
               for t in (lista if isinstance(lista, list) else []) if isinstance(t, dict) and str(t.get('texto', '')).strip()]
    if not trechos:
        raise SystemExit('mande a lista de trechos (JSON: [{"texto": "...", "nota": "..."}])')
    p = _peca(pid)
    etapas = p['esteira'] or []
    nome = etapas[min(p['etapa'], len(etapas) - 1)]['nome']
    textos = dict(p['textos'] or {})
    t2 = dict(textos.get('_trechos') or {})
    t2[nome] = trechos
    textos['_trechos'] = t2
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), pid), commit=True)
    corrido = '\n\n'.join(t['texto'] for t in trechos)
    if so_salvar:
        reescrever(pid, corrido)
    else:
        entregar(pid, corrido)


def reescrever(pid, texto):
    """Ajuste pedido na conversa: reescreve o documento (e o texto da etapa) sem passar de etapa."""
    import html as _h
    p = _peca(pid)
    etapas = p['esteira'] or []
    nome = etapas[min(p['etapa'], len(etapas) - 1)]['nome']
    textos = dict(p['textos'] or {})
    textos[nome] = texto.strip()
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), pid), commit=True)
    _documento(p, f"<h2>{_h.escape(p['titulo'])}</h2>" + _html(texto))
    print('DOCUMENTO REESCRITO')


def novas(pid, bruto):
    p = _peca(pid)
    etapas = p['esteira'] or []
    lista = [_headline(str(t)) for t in json.loads(bruto or '[]') if str(t).strip()]
    if not lista:
        raise SystemExit('mande a lista de headlines (JSON)')
    # Pediu N, vão N (17/10: "tinha pedido 5 headlines e o Leo está me trazendo mais").
    n = _quantas(p['titulo'])
    if n and len(lista) > n:
        print(f'(o pedido era de {n}: fiquei com as {n} primeiras)')
        lista = lista[:n]
    nome = etapas[0]['nome'] if etapas else 'Headlines'
    for i, h in enumerate(lista):
        # Ficam na 1ª etapa, prontas, esperando o Davi passar adiante.
        _q("""INSERT INTO esteira_itens (cliente_id, setor_id, titulo, textos, etapa, situacao, ordem)
              VALUES (%s, %s, %s, %s::jsonb, 0, 'feito', %s)""",
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
    elif a[0] == 'anotado' and len(a) > 1:
        anotado(a[1], sys.stdin.read(), so_salvar='--so-salvar' in a)
    elif a[0] == 'reescrever' and len(a) > 1:
        reescrever(a[1], sys.stdin.read())
    elif a[0] == 'ideia' and len(a) > 2:
        ideia(a[1], a[2])
    elif a[0] == 'devolver' and len(a) > 2:
        devolver(a[1], a[2])
    else:
        raise SystemExit(__doc__)
