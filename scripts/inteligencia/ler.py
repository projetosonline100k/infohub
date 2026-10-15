"""Mostra a inteligência de um funcionário num projeto: o geral dele + o do projeto.

  python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo            → lista
  python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo --saida DIR → grava cada item em DIR/*.txt

Somente leitura. O agente lê os .txt antes de trabalhar."""
import argparse
import re
from pathlib import Path

from comum import consultar


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--cliente', required=True)
    p.add_argument('--agente', required=True)
    p.add_argument('--saida')
    a = p.parse_args()
    agente = a.agente.strip().lower()
    itens = consultar("""
        select i.id, i.escopo, i.tipo, i.nome, i.status, i.mensagem, i.caracteres, i.observacao,
               case when %s or i.tipo = 'aprendizado' then i.conteudo end as conteudo
          from inteligencia_membros i join clientes c on c.id = %s
         where i.agente = %s and i.user_id = c.user_id
           and (i.escopo = 'geral' or i.cliente_id = c.id)
         order by (i.tipo = 'aprendizado') desc, i.escopo, i.created_at""", (bool(a.saida), a.cliente, agente))
    if not itens:
        print(f'{agente}: sem inteligência neste projeto ainda.')
        return
    saida = Path(a.saida).expanduser() if a.saida else None
    if saida:
        saida.mkdir(parents=True, exist_ok=True)
    for n, i in enumerate(itens, 1):
        linha = f"{n:02d}. [{'geral' if i['escopo'] == 'geral' else 'projeto'}] {i['tipo']} · {i['nome']} · {i['status']}"
        linha += f" · {i['caracteres']:,} caracteres".replace(',', '.') if i['caracteres'] else ''
        if i['mensagem']:
            linha += f" · {i['mensagem']}"
        print(linha)
        if i['tipo'] == 'aprendizado' and i['conteudo']:
            print('    SIGA SEMPRE (o Davi já te ensinou):')
            for regra in i['conteudo'].splitlines():
                print(f'    {regra}')
        if saida and i['conteudo']:
            nome = re.sub(r'[^a-z0-9]+', '-', i['nome'].lower()).strip('-')[:60] or 'item'
            (saida / f"{n:02d}-{i['escopo']}-{nome}.txt").write_text(i['conteudo'])
    if saida:
        print(f'\nTextos gravados em {saida}')


if __name__ == '__main__':
    main()
