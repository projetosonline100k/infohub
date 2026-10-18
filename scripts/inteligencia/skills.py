"""Skills do Davi (as do Claude, em ~/.claude/skills) como inteligência de um funcionário
(pedido do Davi, 18/10/2026: "no do Junior poderia ter as skills também, porque elas já
vêm como critério, carregue aí"). Cada skill vira um item "Skill: <nome>" (tipo texto,
alcance geral: vai junto se o funcionário for para outro projeto); as referências da
skill entram como "Skill: <nome> · <referência>". O ler.py já entrega isso antes de cada
trabalho, e a janela de critérios da esteira mostra a lista.

  python3 scripts/inteligencia/skills.py disponiveis
  python3 scripts/inteligencia/skills.py carregar --cliente <cliente_id> --agente junior roteiros-virais intensificador ...

Carregar de novo atualiza o texto (não duplica)."""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migration_db import connect  # noqa: E402

PASTAS = [Path.home() / '.claude' / 'skills']


def _achar(nome):
    for base in PASTAS:
        for p in sorted(base.rglob(f'{nome}/SKILL.md')):
            return p.parent
    return None


def _descricao(texto):
    m = re.search(r'^description:\s*(?:>\s*\n)?((?:.+\n?)+?)(?:^\w+:|^---)', texto, re.M)
    return ' '.join((m.group(1) if m else '').split()).strip('"\'')[:400]


def disponiveis():
    vistos = set()
    for base in PASTAS:
        for p in sorted(base.rglob('SKILL.md')):
            if p.parent.name in vistos:
                continue
            vistos.add(p.parent.name)
            print(f"{p.parent.name:32} {_descricao(p.read_text())[:110]}")


def carregar(cliente, agente, nomes):
    c = connect()
    try:
        q = c.cursor()
        q.execute('SELECT user_id FROM public.clientes WHERE id = %s', (cliente,))
        dono = q.fetchone()
        if not dono:
            sys.exit('Projeto não encontrado.')
        q.execute('SELECT id FROM public.membros WHERE cliente_id = %s AND lower(nome) = %s LIMIT 1', (cliente, agente))
        membro = q.fetchone()
        if not membro:
            sys.exit(f'Funcionário "{agente}" não encontrado neste projeto.')
        for nome in nomes:
            pasta = _achar(nome)
            if not pasta:
                print(f'✗ {nome}: skill não encontrada')
                continue
            principal = (pasta / 'SKILL.md').read_text()
            itens = [(f'Skill: {nome}', _descricao(principal), principal)]
            for ref in sorted((pasta / 'references').glob('*.md')) if (pasta / 'references').is_dir() else []:
                itens.append((f'Skill: {nome} · {ref.stem}', f'Referência da skill {nome}.', ref.read_text()))
            for titulo, desc, texto in itens:
                q.execute("""SELECT id FROM public.inteligencia_membros
                              WHERE user_id = %s AND agente = %s AND nome = %s LIMIT 1""", (dono[0], agente, titulo))
                ja = q.fetchone()
                if ja:
                    q.execute("""UPDATE public.inteligencia_membros SET conteudo = %s, observacao = %s,
                                        status = 'pronto', processado_em = now() WHERE id = %s""", (texto, desc, ja[0]))
                else:
                    q.execute("""INSERT INTO public.inteligencia_membros
                                   (cliente_id, user_id, membro_id, agente, escopo, tipo, nome, observacao, conteudo, status, processado_em)
                                 VALUES (%s, %s, %s, %s, 'geral', 'texto', %s, %s, %s, 'pronto', now())""",
                              (cliente, dono[0], membro[0], agente, titulo, desc, texto))
                print(f"{'↻' if ja else '✓'} {titulo} ({len(texto):,} caracteres)".replace(',', '.'))
        c.commit()
    finally:
        c.close()


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('disponiveis')
    c = sub.add_parser('carregar')
    c.add_argument('--cliente', required=True)
    c.add_argument('--agente', required=True)
    c.add_argument('skills', nargs='+')
    a = p.parse_args()
    if a.cmd == 'disponiveis':
        disponiveis()
    else:
        carregar(a.cliente, a.agente.strip().lower(), a.skills)


if __name__ == '__main__':
    main()
