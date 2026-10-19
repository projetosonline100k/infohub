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
  python3 scripts/empresa/esteira.py referencia <peca_id> <video_id>   → liga o vídeo do banco: link + original traduzido no fim do documento
  python3 scripts/empresa/esteira.py pensando <peca_id> "<o que estou decidindo agora>"  → aparece ao vivo na peça para o Davi
  python3 scripts/empresa/esteira.py checagem <peca_id> <<'FIM'          → conferência dos critérios numerados da etapa (antes do anotado)
  [{"n": 1, "ok": true, "obs": "como atende"}]
  FIM

Em setores.esteira cada etapa tem: criterios (lista numerada; antes texto), formatos ([{nome, texto}]
de referência, ex.: formatos de roteiro do Junior) e davi_aprova.
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
                     s.nome, s.esteira, p.documento_id, s.cerebros
                FROM esteira_itens p JOIN setores s ON s.id = p.setor_id WHERE p.id = %s""", (pid,), um=True)
    if not r:
        raise SystemExit('peça não encontrada')
    return dict(zip(['id', 'cliente_id', 'setor_id', 'titulo', 'textos', 'etapa', 'situacao', 'nota', 'atividade_id', 'setor', 'esteira', 'documento_id', 'cerebros'], r))


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


REF_TITULO = 'Referência (vídeo original)'


def _referencia(p, vid=None):
    """O vídeo do banco (videos_referencia) que deu origem à peça (18/10, Davi: "sempre que trouxer o
    roteiro, principalmente do banco, o link da referência ou o roteiro original traduzido").
    Com vid (id ou prefixo de 8), liga a peça a ele; sem, usa o já ligado ou acha o "Referência: <id>"
    que o Leo escreve na headline. Guarda em textos._referencia e devolve o dict (ou None)."""
    textos = dict(p['textos'] or {})
    if not vid and textos.get('_referencia'):
        return textos['_referencia']
    if not vid:
        tudo = ' '.join(str(v) for k, v in textos.items() if not k.startswith('_'))
        m = re.search(r'[Rr]efer[êe]ncia[^0-9a-f]{0,20}([0-9a-f]{8})(?:-[0-9a-f-]{27})?\b', tudo)
        vid = m.group(1) if m else None
    if not vid:
        return None
    r = _q("""SELECT id, criador, visualizacoes, idioma, link_video, coalesce(nullif(transcricao_pt, ''), transcricao), titulo_pt, titulo
                FROM videos_referencia WHERE cliente_id = %s AND id::text LIKE %s ORDER BY visualizacoes DESC NULLS LAST LIMIT 1""",
           (p['cliente_id'], vid.strip().lower() + '%'), um=True)
    if not r:
        return None
    link = re.sub(r'[\]\s]+$', '', (r[4] or '').strip())
    link = re.sub(r'(instagram\.com/(?:reel|p)/[^/?%]+/?).*$', r'\1', link)   # tira lixo de rastreio (?xtok, ]) do link
    ref = {'id': str(r[0]), 'criador': r[1], 'views': r[2], 'idioma': r[3], 'link': link,
           'original': (r[5] or '').strip(), 'traduzido': (r[3] or 'pt') != 'pt'}
    textos['_referencia'] = ref
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), p['id']), commit=True)
    p['textos'] = textos
    return ref


def _bloco_referencia(ref):
    import html as _h
    if not ref:
        return ''
    views = f" · {ref['views']:,} views".replace(',', '.') if ref.get('views') else ''
    quem = _h.escape(ref.get('criador') or 'vídeo original') + views
    link = f'<a href="{_h.escape(ref["link"])}">{_h.escape(ref["link"])}</a>' if ref.get('link') else '(sem link no banco)'
    rotulo = 'Roteiro original traduzido' if ref.get('traduzido') else 'Roteiro original'
    corpo = ''.join(f'<p>{_h.escape(l.strip())}</p>' for l in re.split(r'\n\s*\n', ref.get('original') or '') if l.strip())
    return (f"<h3>{REF_TITULO}</h3><p><strong>{quem}</strong><br>{link}</p>"
            + (f"<p><strong>{rotulo}:</strong></p><blockquote>{corpo}</blockquote>" if corpo else ''))


def _sem_referencia(html):
    """O documento sem o bloco da referência (ele fica sempre no fim)."""
    i = html.find(f'<h3>{REF_TITULO}')
    return html[:i] if i >= 0 else html


def referencia(pid, vid):
    """esteira.py referencia <peça> <id do vídeo no banco>: liga e põe o bloco no fim do documento."""
    p = _peca(pid)
    ref = _referencia(p, vid)
    if not ref:
        raise SystemExit('vídeo não achado no banco de referências deste projeto')
    if p.get('documento_id'):
        _documento(p, _sem_referencia(_conteudo_doc(p['documento_id'])) + _bloco_referencia(ref))
    print(f"REFERÊNCIA LIGADA: {ref.get('criador')} · {ref.get('link')}")


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


def _criterios(e):
    """Critérios da etapa como lista (o Davi salva um por um; antes era um texto só)."""
    c = e.get('criterios')
    if isinstance(c, list):
        return [str(x).strip() for x in c if str(x).strip()]
    return [re.sub(r'^\s*\d+[.)-]\s*', '', l).strip() for l in str(c or '').split('\n') if l.strip()]


def _cerebro(p):
    """O cérebro de para quem é a peça (textos._para); sem escolha, o primeiro cadastrado."""
    lista = [c for c in (p.get('cerebros') or []) if isinstance(c, dict)]
    if not lista:
        return None
    para = (p['textos'] or {}).get('_para')
    return next((c for c in lista if c.get('id') == para), lista[0])


def checagem(pid, bruto):
    """Conferência dos critérios da etapa (17/10, Davi: "sempre que o Elias for fazendo, ele lê
    esse critério para ver se está ok"). stdin: [{"n": 1, "ok": true, "obs": "..."}]."""
    try:
        lista = json.loads(bruto or '[]')
    except json.JSONDecodeError as e:
        raise SystemExit(f'JSON inválido: {e}')
    p = _peca(pid)
    etapas = p['esteira'] or []
    if p['etapa'] >= len(etapas):
        raise SystemExit('a peça já está pronta')
    e = etapas[p['etapa']]
    crit = _criterios(e)
    itens = [{'n': int(x['n']), 'ok': bool(x.get('ok')), 'obs': str(x.get('obs') or '').strip()[:400]}
             for x in (lista if isinstance(lista, list) else []) if isinstance(x, dict) and str(x.get('n', '')).isdigit()
             and 1 <= int(x['n']) <= len(crit)]
    faltam = sorted(set(range(1, len(crit) + 1)) - {i['n'] for i in itens})
    textos = dict(p['textos'] or {})
    ck = dict(textos.get('_checagem') or {})
    ck[e['nome']] = sorted(itens, key=lambda i: i['n'])
    textos['_checagem'] = ck
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), pid), commit=True)
    ruins = [i['n'] for i in itens if not i['ok']]
    print(f"conferência salva: {len(itens) - len(ruins)}/{len(crit)} ok"
          + (f"; NÃO passaram: {ruins} (ajuste e confira de novo)" if ruins else '')
          + (f"; faltou conferir: {faltam}" if faltam else ''))


def contexto(pid):
    p = _peca(pid)
    etapas = p['esteira'] or []
    print(f"ESTEIRA do escritório {p['setor']} · peça {p['id']}")
    print(f"Título/headline: {p['titulo']}")
    print("Etapas: " + " → ".join(f"{i + 1}. {e['nome']}" for i, e in enumerate(etapas)) + " → pronto para o Davi")
    print(f"Agora: etapa {p['etapa'] + 1} ({etapas[p['etapa']]['nome'] if p['etapa'] < len(etapas) else 'pronto'}), {p['situacao']}")
    if p['nota']:
        print(f"NOTA (ajuste pedido na revisão ou pelo Davi): {p['nota']}")
    cer = _cerebro(p)
    if cer:
        print(f"\nCÉREBRO DE {cer['nome'].upper()} (para quem é este roteiro: baseie-se nisto; use a apresentação e a narrativa daqui"
              " em vez de inventar):")
        for sec in cer.get('secoes') or []:
            if (sec.get('texto') or '').strip():
                print(f"\n  [{(sec.get('titulo') or '').strip() or 'Sem título'}]\n" + '\n'.join('    ' + l for l in sec['texto'].strip().split('\n')))
    if p['etapa'] < len(etapas):
        e = etapas[p['etapa']]
        crit = _criterios(e)
        if crit:
            print(f"\nCRITÉRIOS DO DAVI PARA ESTA ETAPA ({e['nome']}) — confira UM POR UM antes de entregar:")
            for i, c in enumerate(crit, 1):
                print(f"  {i}. {c}")
            print(f"Antes de entregar, registre a conferência (o Davi vê critério por critério):\n"
                  f"  python3 scripts/empresa/esteira.py checagem {p['id']} <<'FIM'\n"
                  f'  [{{"n": 1, "ok": true, "obs": "<como o texto atende>"}}, {{"n": 2, "ok": false, "obs": "<o que falta>"}}]\n  FIM\n'
                  "Se algum ficar \"ok\": false, ajuste o texto e confira de novo até todos passarem (ou explique na obs por que não dá).")
        else:
            print(f"\nCRITÉRIOS DO DAVI PARA ESTA ETAPA ({e['nome']}): (ainda não definidos: siga o seu manual e os aprendizados, "
                  "e na conversa proponha ao Davi os critérios que você usou)")
        formatos = [f for f in (e.get('formatos') or []) if isinstance(f, dict) and (f.get('texto') or '').strip()]
        if formatos:
            print(f"\nFORMATOS DE REFERÊNCIA QUE O DAVI DEU PARA ESTA ETAPA (escolha o que mais combina com a peça e siga a estrutura;"
                  " diga na nota do 1º trecho qual formato usou):")
            for i, f in enumerate(formatos, 1):
                print(f"\n  [Formato {i}: {(f.get('nome') or '').strip() or 'sem nome'}]\n" + '\n'.join('    ' + l for l in f['texto'].strip().split('\n')))
    for nome, texto in (p['textos'] or {}).items():
        if nome.startswith('_'):
            continue
        print(f"\n--- {nome} ---\n{texto}")
    ref = _referencia(p)
    if ref:
        print(f"\n--- Referência do banco (vai sozinha no fim do documento: link + {'original traduzido' if ref.get('traduzido') else 'original'}) ---\n"
              f"{ref.get('criador')} · {ref.get('views') or '?'} views · {ref.get('link')}")
    else:
        print("\nREFERÊNCIA: se a peça veio de um vídeo do banco (videos_referencia), ligue antes de entregar — o Davi quer o link "
              f"e o roteiro original traduzido no documento: python3 scripts/empresa/esteira.py referencia {p['id']} <id do vídeo>")
    if etapas:
        # Skills do Davi carregadas na inteligência de quem faz (scripts/inteligencia/skills.py): valem como critério.
        sk = _q("""SELECT i.nome, i.observacao FROM inteligencia_membros i
                     JOIN membros m ON m.id = %s JOIN clientes c ON c.id = %s
                    WHERE i.agente = lower(m.nome) AND i.user_id = c.user_id AND i.nome LIKE 'Skill:%%' AND i.status = 'pronto'
                      AND (i.escopo = 'geral' OR i.cliente_id = c.id)
                    ORDER BY i.nome""", (etapas[min(p['etapa'], len(etapas) - 1)]['membro_id'], p['cliente_id']))   # peça pronta: as do revisor (ajustes na conversa)
        if sk:
            print("\nSKILLS DO DAVI (valem como critério: siga o método delas; a 'gerador-roteiro-por-headline', se houver, orquestra as outras):")
            for nome, obs in sk:
                print(f"  - {nome[len('Skill: '):]}" + (f": {obs[:160]}" if obs else ''))
            print(f"Leia o texto completo antes de escrever: python3 scripts/inteligencia/ler.py --cliente {p['cliente_id']} "
                  f"--agente <seu nome em minúsculas> --saida /tmp/inteligencia-{str(p['id'])[:8]}  (arquivos *-skill-*.txt)")
    for nome, ck in ((p['textos'] or {}).get('_checagem') or {}).items():
        print(f"\n--- Conferência dos critérios ({nome}) ---")
        for c in ck:
            print(f"{c.get('n')}. {'✓' if c.get('ok') else '✗'} {c.get('obs') or ''}")
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
    ref = _referencia(p) if p['etapa'] >= 1 else None   # antes de copiar os textos: ele grava textos._referencia
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
        _documento(p, f"<h2>{_h.escape(titulo)}</h2>" + _html(texto) + _bloco_referencia(ref))
    else:
        atual = _sem_referencia(_conteudo_doc(_documento(p)))
        _documento(p, atual + f"<h3>{_h.escape(nome)} · {_q('SELECT nome FROM membros WHERE id = %s', (etapas[p['etapa']]['membro_id'],), um=True)[0]}</h3>" + _html(texto)
                   + _bloco_referencia(ref))
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


def pensando(pid, texto):
    """O que o funcionário está pensando/decidindo enquanto faz a etapa (18/10, Davi: "vai aparecer
    aqui o Junior escrevendo, o que está pensando, quais critérios usou?"). Aparece ao vivo na peça."""
    from datetime import datetime, timezone
    texto = ' '.join((texto or '').split())[:600]
    if not texto:
        raise SystemExit('mande o que está pensando')
    p = _peca(pid)
    etapas = p['esteira'] or []
    nome = etapas[min(p['etapa'], len(etapas) - 1)]['nome']
    textos = dict(p['textos'] or {})
    pens = dict(textos.get('_pensamento') or {})
    pens[nome] = (list(pens.get(nome) or []) + [{'em': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'texto': texto}])[-40:]
    textos['_pensamento'] = pens
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), pid), commit=True)
    print('ok (o Davi vê ao vivo)')


def reescrever(pid, texto):
    """Ajuste pedido na conversa: reescreve o documento (e o texto da etapa) sem passar de etapa."""
    import html as _h
    p = _peca(pid)
    etapas = p['esteira'] or []
    nome = etapas[min(p['etapa'], len(etapas) - 1)]['nome']
    ref = _referencia(p)
    textos = dict(p['textos'] or {})
    textos[nome] = texto.strip()
    _q("UPDATE esteira_itens SET textos = %s::jsonb WHERE id = %s", (json.dumps(textos, ensure_ascii=False), pid), commit=True)
    _documento(p, f"<h2>{_h.escape(p['titulo'])}</h2>" + _html(texto) + _bloco_referencia(ref))
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
           (p['cliente_id'], p['setor_id'], h[:300], json.dumps({nome: h, 'Ideia': p['titulo'], **({'_para': (p['textos'] or {})['_para']} if (p['textos'] or {}).get('_para') else {})},
                      ensure_ascii=False), i), commit=True)
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
    elif a[0] == 'pensando' and len(a) > 2:
        pensando(a[1], ' '.join(a[2:]))
    elif a[0] == 'checagem' and len(a) > 1:
        checagem(a[1], sys.stdin.read())
    elif a[0] == 'referencia' and len(a) > 2:
        referencia(a[1], a[2])
    elif a[0] == 'reescrever' and len(a) > 1:
        reescrever(a[1], sys.stdin.read())
    elif a[0] == 'ideia' and len(a) > 2:
        ideia(a[1], a[2])
    elif a[0] == 'devolver' and len(a) > 2:
        devolver(a[1], a[2])
    else:
        raise SystemExit(__doc__)
