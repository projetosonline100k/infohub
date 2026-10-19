"""Vigia de trabalho travado (pedido do Davi, 17/10/2026: "quero que seja de forma
automática, e só me avise se eu realmente precisar colocar a mão").

O ouvinte chama `rodar()` a cada 5 min. Para cada coisa da equipe que parou:
  1. tenta resolver sozinho UMA vez (recomeça a tarefa com o ▶️, o mesmo do botão
     "Começar agora"; peça da esteira volta para a fila);
  2. se travar de novo, ou se não der para recomeçar sozinho (carrossel do Roy, edição
     do Danilo: eles têm serviço próprio), cria uma tarefa do Davi "⚠️ Travou: …",
     que aparece no Precisa de você e na orbe do Atlas. Uma por coisa travada.

  python3 scripts/empresa/vigia.py          → uma rodada (mostra o que fez)
"""
import json
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts'))
from migration_db import connect  # noqa: E402

ESTADO = Path.home() / '.infopro-hub' / 'ouvinte' / 'vigia.json'
DAVI = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
PARADO_MIN = 60          # sem avanço nenhum por 1 h = travou
PARADO_MIN_SISTEMA = 100  # tarefa que mexe no sistema tem até 90 min


def _q(sql, args=(), commit=False):
    c = connect()
    try:
        q = c.cursor()
        q.execute(sql, args)
        r = q.fetchall() if q.description else None
        if commit:
            c.commit()
        return r
    finally:
        c.close()


def _ler():
    try:
        return json.loads(ESTADO.read_text())
    except Exception:
        return {}


def _gravar(e):
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text(json.dumps(e, ensure_ascii=False))


def _rodando(trecho):
    """Tem algum Claude trabalhando nisso agora? (o id da tarefa vai no prompt)."""
    try:
        out = subprocess.run(['ps', '-axo', 'command'], capture_output=True, text=True).stdout
    except Exception:
        return False
    return any('claude' in l and trecho in l for l in out.splitlines())


def _avisar_davi(cliente_id, chave, titulo, descricao, estado):
    """Tarefa do Davi "⚠️ Travou: …" (uma por coisa travada)."""
    if estado.get('avisos', {}).get(chave):
        return False
    r = _q("""SELECT m.id, m.setor_id, c.user_id FROM clientes c JOIN membros m ON m.cliente_id = c.id AND m.conta_id = c.user_id AND m.ativo
               WHERE c.id = %s LIMIT 1""", (cliente_id,))
    if not r:
        return False
    mid, sid, dono = r[0]
    col = _q("SELECT status_key FROM colunas_atividade WHERE cliente_id = %s AND NOT eh_conclusao ORDER BY ordem LIMIT 1", (cliente_id,))
    _q("""INSERT INTO atividades (titulo, cliente_id, user_id, data_atividade, status, concluida, ordem, prioridade,
                                  responsavel_id, setor_id, situacao, tipo, descricao)
          VALUES (%s, %s, %s, current_date, %s, false, 0, 'alta', %s, %s, 'fila', 'travado', %s)""",
       (titulo[:300], cliente_id, dono, col[0][0] if col else 'backlog', mid, sid, descricao[:2000]), commit=True)
    estado.setdefault('avisos', {})[chave] = time.time()
    return True


def _servico_proprio(nome, cliente_id, tipo):
    """Roy (carrossel no projeto Davi) e Danilo (projeto Davi) têm serviço próprio: o vigia só avisa."""
    n = (nome or '').lower()
    return (n == 'roy' and cliente_id == DAVI and (tipo or '') not in ('pagina', 'quiz', 'programacao')) or (n == 'danilo' and cliente_id == DAVI)


def rodar():
    e = _ler()
    agora = time.time()
    feito = []
    snaps = e.setdefault('snaps', {})
    tentou = e.setdefault('tentou', {})
    vistos = set()

    # 1. Tarefas das IAs "em andamento" sem avanço (progresso e observação iguais) há 1 h, sem ninguém trabalhando nelas.
    for aid, cid, titulo, prog, obs, tipo, nome in _q("""
            SELECT a.id::text, a.cliente_id::text, a.titulo, a.progresso, a.observacao, a.tipo, m.nome
              FROM atividades a JOIN membros m ON m.id = a.responsavel_id
             WHERE a.situacao = 'andamento' AND NOT a.concluida AND a.deleted_at IS NULL AND m.eh_ia
               AND lower(m.nome) NOT IN ('atlas', 'jarvis', 'dalila')""") or []:
        vistos.add(aid)
        if _servico_proprio(nome, cid, tipo):
            continue   # Roy/Danilo do projeto Davi: o andamento é pelo carrossel/edição (item 3)
        marca = f'{prog}|{obs}'
        s = snaps.get(aid)
        if not s or s['marca'] != marca:
            snaps[aid] = {'marca': marca, 'desde': agora}
            continue
        limite = (PARADO_MIN_SISTEMA if tipo == 'programacao' else PARADO_MIN) * 60
        if agora - s['desde'] < limite or _rodando(aid):
            continue
        if not tentou.get(aid):
            _q("""UPDATE atividades SET situacao = 'fila', progresso = NULL,
                         observacao = '▶️ Recomeçando sozinho: parou sem avanço há mais de 1 h (vigia)' WHERE id = %s""", (aid,), commit=True)
            tentou[aid] = agora
            snaps.pop(aid, None)
            feito.append(f'recomecei: {nome} · {titulo[:60]}')
        elif _avisar_davi(cid, f'tarefa:{aid}', f'⚠️ Travou: {nome} · {titulo}'[:300],
                          f'A tarefa "{titulo}" do {nome} está parada há mais de 1 h sem avançar'
                          + ' (já tentei recomeçar sozinho uma vez).'
                          + f'\nÚltimo passo: {obs or "-"} · {prog or 0}%.\nO que fazer: abra o {nome} no Escritório e clique em "Começar agora", ou peça ajuda ao chat do {nome}.', e):
            feito.append(f'avisei o Davi: {nome} · {titulo[:60]}')

    # 2. Tarefas que falharam ("⚠️ Não consegui fazer sozinho") e ficaram na fila: recomeça uma vez; depois, avisa.
    for aid, cid, titulo, obs, tipo, nome in _q("""
            SELECT a.id::text, a.cliente_id::text, a.titulo, a.observacao, a.tipo, m.nome
              FROM atividades a JOIN membros m ON m.id = a.responsavel_id
             WHERE a.situacao = 'fila' AND NOT a.concluida AND a.deleted_at IS NULL AND m.eh_ia
               AND a.observacao LIKE '⚠️ Não consegui fazer sozinho%%'""") or []:
        if not tentou.get(aid):
            _q("UPDATE atividades SET observacao = '▶️ Tentando de novo sozinho (vigia): ' || left(observacao, 300) WHERE id = %s", (aid,), commit=True)
            tentou[aid] = agora
            feito.append(f'tentando de novo: {nome} · {titulo[:60]}')
        elif _avisar_davi(cid, f'falhou:{aid}', f'⚠️ Travou: {nome} · {titulo}'[:300],
                          f'O {nome} não conseguiu fazer "{titulo}", nem na segunda tentativa.\nMotivo: {obs}\n'
                          f'O que fazer: leia o motivo; se faltar algo seu (acesso, arquivo, decisão), resolva e clique em "Começar agora" no {nome}.', e):
            feito.append(f'avisei o Davi (falhou 2x): {nome} · {titulo[:60]}')

    # 3. Carrossel do Roy "produzindo" e edição do Danilo trabalhando sem atualizar há 1h30: só avisa (serviço próprio).
    for cid, cid_tab, titulo, quem in (_q("""
            SELECT id::text, cliente_id::text, 'Carrossel ' || lpad(coalesce(numero, 0)::text, 3, '0') || ' · ' || tema, 'Roy'
              FROM carrosseis c WHERE status = 'produzindo' AND atualizado_em < now() - interval '90 minutes'
               -- Lote andando: se algum carrossel da mesma tarefa mexeu na última 1h30, o Roy está trabalhando nele.
               AND NOT EXISTS (SELECT 1 FROM carrosseis o WHERE o.atividade_roy_id = c.atividade_roy_id AND c.atividade_roy_id IS NOT NULL
                                 AND o.atualizado_em > now() - interval '90 minutes')
            UNION ALL
            SELECT id::text, cliente_id::text, titulo, 'Danilo'
              FROM edicoes_video WHERE status IN ('editando', 'renderizando') AND atualizado_em < now() - interval '90 minutes'""") or []):
        if _avisar_davi(cid_tab, f'obj:{cid}', f'⚠️ Travou: {quem} · {titulo}'[:300],
                        f'"{titulo}" está parado há mais de 1h30 com o {quem} sem avançar.\n'
                        f'O que fazer: peça ao chat do {quem} para ver o que aconteceu (o serviço dele pode ter caído).', e):
            feito.append(f'avisei o Davi: {quem} · {titulo[:60]}')

    # 4. Peça da esteira "fazendo" cuja tarefa sumiu ou falhou: volta para a fila (a esteira cria a tarefa de novo).
    for pid, titulo in _q("""
            SELECT p.id::text, p.titulo FROM esteira_itens p LEFT JOIN atividades a ON a.id = p.atividade_id
             WHERE p.situacao = 'fazendo' AND (a.id IS NULL OR a.deleted_at IS NOT NULL OR a.concluida
                   OR (a.situacao = 'fila' AND a.observacao LIKE '⚠️%%'))""") or []:
        _q("UPDATE esteira_itens SET situacao = 'fila', atividade_id = NULL WHERE id = %s", (pid,), commit=True)
        feito.append(f'esteira de volta à fila: {titulo[:60]}')

    # Limpa o que já andou (não está mais em andamento).
    for aid in list(snaps):
        if aid not in vistos:
            snaps.pop(aid, None)
    for chave in [k for k, t in e.get('avisos', {}).items() if agora - t > 7 * 86400]:
        e['avisos'].pop(chave, None)
    for aid in [k for k, t in tentou.items() if agora - t > 7 * 86400]:
        tentou.pop(aid, None)
    _gravar(e)
    return feito


if __name__ == '__main__':
    for linha in rodar():
        print(linha)
