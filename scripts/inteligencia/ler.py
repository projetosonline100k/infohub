"""Mostra a inteligência de um funcionário num projeto: o geral dele + o do projeto.

  python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo            → lista
  python3 scripts/inteligencia/ler.py --cliente <cliente_id> --agente ítalo --saida DIR → grava cada item em DIR/*.txt

Somente leitura. O agente lê os .txt antes de trabalhar."""
import argparse
import html
import re
from pathlib import Path

from comum import consultar


def texto_do_html(conteudo):
    """HTML do documento → texto (uma linha por parágrafo/item; o quadro já vem com o texto dos cartões)."""
    t = re.sub(r'(?i)</(p|h[1-6]|li|blockquote|div)>|<br\s*/?>', '\n', conteudo or '')
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    return re.sub(r'\n{3,}', '\n\n', t).strip()


def documentos_da_pasta(pasta_id):
    """Pasta ao vivo (24/10): o texto ATUAL de todos os documentos da pasta e das subpastas."""
    return consultar("""
        with recursive arvore as (
          select id from pastas_atividade where id = %s and deleted_at is null
          union all
          select p.id from pastas_atividade p join arvore a on p.parent_id = a.id where p.deleted_at is null)
        select d.titulo, d.conteudo from documentos d
         where d.pasta_id in (select id from arvore) and d.deleted_at is null and d.tipo <> 'mapa'
         order by d.titulo""", (pasta_id,))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--cliente', required=True)
    p.add_argument('--agente', required=True)
    p.add_argument('--saida')
    a = p.parse_args()
    agente = a.agente.strip().lower()
    itens = consultar("""
        select i.id, i.escopo, i.tipo, i.nome, i.status, i.mensagem, i.caracteres, i.observacao, i.pasta_id,
               case when %s or i.tipo = 'aprendizado' then i.conteudo end as conteudo
          from inteligencia_membros i join clientes c on c.id = %s
         where i.agente = %s and i.user_id = c.user_id
           and (i.escopo = 'geral' or i.cliente_id = c.id)
         order by (i.tipo = 'aprendizado') desc, i.escopo, i.created_at""", (bool(a.saida), a.cliente, agente))
    # Biblioteca geral (21/10): conhecimento marcado como compartilhado vale para todo funcionário de
    # toda conta (skills de roteiro viral, quiz…). Sem repetir o que ele já tem com o mesmo nome.
    ja = {i['nome'] for i in itens}
    for b in consultar("""
        select distinct on (i.nome) i.id, 'biblioteca' as escopo, i.tipo, i.nome, i.status, i.mensagem, i.caracteres, i.observacao,
               case when %s then i.conteudo end as conteudo
          from inteligencia_membros i
         where i.compartilhado and i.status = 'pronto'
         order by i.nome, i.created_at""", (bool(a.saida),)):
        if b['nome'] not in ja:
            itens.append(b)
    if not itens:
        print(f'{agente}: sem inteligência neste projeto ainda.')
        return
    saida = Path(a.saida).expanduser() if a.saida else None
    if saida:
        saida.mkdir(parents=True, exist_ok=True)
    for i in itens:
        if i['tipo'] == 'pasta' and i.get('pasta_id'):
            docs = [(d['titulo'] or 'Sem título', texto_do_html(d['conteudo'])) for d in documentos_da_pasta(i['pasta_id'])]
            docs = [(t, x) for t, x in docs if x]
            i['conteudo'] = '\n\n'.join(f'=== {t} ===\n{x}' for t, x in docs) if a.saida else None
            i['caracteres'] = sum(len(x) for _, x in docs)
            i['mensagem'] = f'ao vivo · {len(docs)} documento(s)'
    for n, i in enumerate(itens, 1):
        linha = f"{n:02d}. [{i['escopo'] if i['escopo'] in ('geral', 'biblioteca') else 'projeto'}] {i['tipo']} · {i['nome']} · {i['status']}"
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
