"""Roteiro do Instalivros → versão do Davi (pedido do Davi por voz, 25/10/2026: "os conteúdos do
Instalivros combinam com o meu perfil; quando um roteiro deles ficar pronto, um agente cria uma
versão adaptada que aparece na minha Vertical para eu gravar, aprovar ou pedir ajuste").

Quando o card do Instalivros sai de "Criando roteiro" para Gravação, o banco cria uma tarefa do
Junior com a marca ADAPTAR:<id do original> (migração 20261025020000). O fluxo de execução do
ouvinte pega e o Junior usa:

  python3 scripts/empresa/adaptacao.py contexto <tarefa>       → original, cérebro do Davi, regras, ajuste pedido
  python3 scripts/empresa/adaptacao.py entregar <tarefa> "<headline>" <<'FIM'
  <roteiro adaptado (texto; parágrafos separados por linha em branco)>
  FIM

O entregar cria (ou atualiza) o card "Aguardando aprovação" na Vertical do Davi, com a etiqueta
Instalivros e o link para o original (ideia_origem_id), e conclui a tarefa.
Pedir ajuste (botão no card): o app cria outra tarefa ADAPTAR:<original>:<card> com o pedido e a
versão anterior guardada na descrição; o entregar troca o roteiro do card e ele volta para aprovação.
"""
import html as _h
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'scripts' / 'empresa'))
from esteira import _q, _html, _concluir_tarefa  # noqa: E402

MARCA = 'ADAPTAR:'
DAVI = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
AJUSTE = '--- Ajuste pedido pelo Davi ---'
ANTERIOR = '--- Versão anterior (guardada) ---'

REGRAS = """REGRAS DA ADAPTAÇÃO (do Davi, siga TODAS):
1. Reescreva só a NARRATIVA e a APRESENTAÇÃO para a voz e o perfil do Davi (@eu.daviqueiroz: produtividade, foco,
   hábitos, fugir da dopamina barata), em primeira pessoa do Davi. A apresentação e a narrativa vêm do cérebro dele (acima).
2. Troque o CTA do Instalivros (seguir/comprar/link do Instalivros) pelo CTA do perfil do Davi (a Apresentação do cérebro).
3. Mantenha a ideia central e as informações do original. NUNCA invente casos, histórias, falas, números ou dados que
   não estejam no roteiro original. Pode cortar o que não combina com o Davi; não pode acrescentar fato novo.
4. A linha logo depois da headline é a mais importante: ela precisa criar vontade de continuar assistindo.
5. Conteúdo tem que ser notável: nada de "eu já sei disso". Se um trecho do original é óbvio, apresente pelo ângulo menos óbvio
   que o próprio original dá (sem inventar).
6. Se o original tem vários roteiros no mesmo documento ("Headline 1", "Headline 2"…), adapte TODOS e mantenha as marcações
   "Headline N" no começo de cada um.
7. Sem emojis, sem travessões, sem etiquetas de cena."""


def texto(roteiro):
    """HTML do editor → texto (como textoDoRoteiro em src/lib/conteudo/roteirosNoDocumento.ts)."""
    r = roteiro or ''
    if not re.search(r'<[a-z][^>]*>', r, re.I):
        return r.strip()
    r = re.sub(r'</(p|h[1-6]|li|div)>', '\n', r, flags=re.I)
    r = re.sub(r'<br\s*/?>', '\n', r, flags=re.I)
    r = re.sub(r'<li[^>]*>', '• ', r, flags=re.I)
    r = _h.unescape(re.sub(r'<[^>]+>', '', r))
    return re.sub(r'\n\s*\n', '\n', r).strip()


def _tarefa(aid):
    r = _q("SELECT descricao, situacao, cliente_id FROM atividades WHERE id = %s", (aid,), um=True)
    d = (r[0] if r else '') or ''
    if not d.startswith(MARCA):
        raise SystemExit('não é uma tarefa de adaptação (ADAPTAR:)')
    ids = d.split('\n', 1)[0][len(MARCA):].split(':')
    return {'descricao': d, 'original': ids[0].strip(), 'card': (ids[1].strip() if len(ids) > 1 and ids[1].strip() else None)}


def _cerebro_davi():
    r = _q("""SELECT x FROM setores s, jsonb_array_elements(s.cerebros) x
               WHERE s.cliente_id = %s AND lower(x->>'nome') = 'davi' LIMIT 1""", (DAVI,), um=True)
    return r[0] if r else None


def _card_do_original(orig):
    r = _q("SELECT id FROM videos_vertical WHERE cliente_id = %s AND ideia_origem_id = %s ORDER BY created_at LIMIT 1", (DAVI, orig), um=True)
    return str(r[0]) if r else None


def contexto(aid):
    t = _tarefa(aid)
    o = _q("""SELECT v.titulo, v.roteiro, v.status, c.nome_especialista FROM videos_vertical v JOIN clientes c ON c.id = v.cliente_id
               WHERE v.id = %s""", (t['original'],), um=True)
    if not o:
        raise SystemExit('o roteiro original não existe mais (apagado no Instalivros): rode execucao.py erro')
    print(f"ADAPTAÇÃO para o perfil do Davi · tarefa {aid}")
    print(f"Original ({o[3]}, card {t['original']}, etapa {o[2]}): {o[0]}")
    print(f"\n--- ROTEIRO ORIGINAL ---\n{texto(o[1])}\n--- FIM DO ORIGINAL ---")
    cer = _cerebro_davi()
    if cer:
        print("\nCÉREBRO DO DAVI (use a apresentação e a narrativa daqui; não invente outras):")
        for sec in cer.get('secoes') or []:
            if (sec.get('texto') or '').strip():
                print(f"\n  [{(sec.get('titulo') or '').strip() or 'Sem título'}]\n" + '\n'.join('    ' + l for l in sec['texto'].strip().split('\n')))
    else:
        print("\n(Cérebro do Davi não cadastrado: use a inteligência do Davi e o manual.)")
    print('\n' + REGRAS)
    card = t['card'] or _card_do_original(t['original'])
    if AJUSTE in t['descricao']:
        pedido = t['descricao'].split(AJUSTE, 1)[1].split(ANTERIOR, 1)[0].strip()
        anterior = t['descricao'].split(ANTERIOR, 1)[1].strip() if ANTERIOR in t['descricao'] else ''
        print(f"\n⚠️ É um AJUSTE pedido pelo Davi na versão anterior. Faça o que ele pediu sem perder o que estava bom"
              f" (e sem quebrar as regras acima):\n{pedido}")
        if anterior:
            print(f"\n--- VERSÃO ANTERIOR (a que ele leu) ---\n{texto(anterior)}\n--- FIM DA VERSÃO ANTERIOR ---")
    elif card:
        print(f"\n(Já existe a versão do Davi deste roteiro, card {card}: o entregar atualiza a mesma, não cria outra.)")
    print(f"\nComo entregar (cria/atualiza o card 'Aguardando aprovação' na Vertical do Davi e conclui a tarefa; NÃO use o execucao.py entregar):\n"
          f"  python3 scripts/empresa/adaptacao.py entregar {aid} \"<headline adaptada>\" <<'FIM'\n  <roteiro adaptado em texto, a headline na 1ª linha>\n  FIM\n"
          f"Se não der para adaptar (ex.: original vazio), rode: python3 scripts/empresa/execucao.py erro {aid} \"<motivo>\"")


def entregar(aid, titulo, corpo):
    corpo = (corpo or '').strip()
    titulo = ' '.join((titulo or '').split())[:300]
    if not corpo or not titulo:
        raise SystemExit('mande a headline e o roteiro')
    t = _tarefa(aid)
    roteiro = corpo if re.match(r'^\s*<[a-z]', corpo, re.I) else _html(corpo)
    card = t['card'] or _card_do_original(t['original'])
    if card:
        _q("UPDATE videos_vertical SET titulo = %s, roteiro = %s, status = 'aprovacao' WHERE id = %s", (titulo, roteiro, card), commit=True)
        acao = 'NOVA VERSÃO no card'
    else:
        o = _q("SELECT titulo FROM videos_vertical WHERE id = %s", (t['original'],), um=True)
        r = _q("""INSERT INTO videos_vertical (cliente_id, user_id, titulo, descricao, roteiro, status, ordem, origem_plataforma, ideia_origem_id)
                  SELECT c.id, c.user_id, %s, %s, %s, 'aprovacao',
                         coalesce((SELECT max(ordem) FROM videos_vertical WHERE cliente_id = c.id AND status = 'aprovacao'), 0) + 1,
                         'instalivros', %s
                    FROM clientes c WHERE c.id = %s RETURNING id""",
               (titulo, f"Adaptado do roteiro do Instalivros: {o[0] if o else ''}".strip(), roteiro, t['original'], DAVI), um=True, commit=True)
        card = str(r[0])
        acao = 'CARD CRIADO'
    _concluir_tarefa(aid, 'Versão adaptada na Vertical do Davi: aguardando aprovação.')
    print(f'{acao} {card} → Aguardando aprovação na Vertical do Davi')


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == 'contexto':
        contexto(a[1])
    elif len(a) >= 3 and a[0] == 'entregar':
        entregar(a[1], a[2], sys.stdin.read())
    else:
        raise SystemExit(__doc__)
