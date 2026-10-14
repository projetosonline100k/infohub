"""Cadastra a empresa do projeto Davi Queiroz (briefing de 12/10/2026):
Diretoria (Davi, Jarvis), Marketing (Ítalo, Pedro, Gabriel) e Audiovisual
(Danilo, Roy, Dalila), e liga as atividades já existentes do projeto às
pessoas pelo nome escrito em "Responsável". Não roda duas vezes."""
from migration_db import connect

CLIENTE = "e4b24f93-0eda-43fc-b50e-3ebe24f8905f"
EMPRESA = [
    ("Diretoria", "Prioridades, estratégia, aprovações e acompanhamento da operação.", "amber", "crown", [
        ("Davi", "Planejamento e decisões", ["definir prioridades", "aprovar decisões", "definir estratégia", "aprovar materiais importantes"], False, True),
        ("Jarvis", "Gestor operacional (IA)", ["acompanhar a operação", "analisar gargalos", "distribuir demandas", "cobrar responsáveis"], True, False),
    ]),
    ("Marketing", "Copy, páginas, métricas e performance.", "violet", "megaphone", [
        ("Ítalo", "Copywriter", ["copy de vendas", "copy de página de vendas", "copy de quiz", "copy de VSL", "headlines", "mensagens de campanha"], False, False),
        ("Pedro", "Gestão de projetos e métricas", ["gestão de projetos", "acompanhamento de métricas", "identificação de gargalos", "análise de performance", "sugestões de melhorias", "acompanhamento de entregas"], False, False),
        ("Gabriel", "Páginas de vendas", ["criação de páginas de vendas", "implementação de landing pages", "montagem de páginas com base na copy", "alterações e testes de página"], False, False),
    ]),
    ("Audiovisual", "Edição de vídeos, artes e programação dos conteúdos.", "blue", "clapperboard", [
        ("Danilo", "Editor de vídeos sênior", ["edição", "cortes", "motion", "legendas", "finalização"], False, False),
        ("Roy", "Criador de carrosséis", ["criação de carrosséis", "adaptação de conteúdo para artes", "peças visuais", "thumbnails e capas"], False, False),
        ("Dalila", "Social media", ["programação de conteúdos", "organização das publicações", "legendas", "acompanhamento da agenda"], False, False),
    ]),
]

c = connect()
q = c.cursor()
q.execute("select user_id from clientes where id = %s", (CLIENTE,))
dono = q.fetchone()[0]
q.execute("select count(*) from setores where cliente_id = %s", (CLIENTE,))
ja_tem = q.fetchone()[0] > 0
for i, (setor, desc, cor, icone, pessoas) in ([] if ja_tem else enumerate(EMPRESA)):
    q.execute("insert into setores (cliente_id, nome, descricao, cor, icone, ordem) values (%s,%s,%s,%s,%s,%s) returning id",
              (CLIENTE, setor, desc, cor, icone, i))
    setor_id = q.fetchone()[0]
    for j, (nome, funcao, resp, ia, eh_dono) in enumerate(pessoas):
        q.execute("""insert into membros (cliente_id, setor_id, nome, funcao, responsabilidades, eh_ia, conta_id, ordem)
                     values (%s,%s,%s,%s,%s,%s,%s,%s)""",
                  (CLIENTE, setor_id, nome, funcao, resp, ia, dono if eh_dono else None, i * 10 + j))
# Liga as atividades que já existem (o gatilho acha a pessoa pelo nome).
# Mesma regra do gatilho atividade_liga_membro (nome igual ou mesmo primeiro nome).
q.execute("""update atividades a set
               responsavel_id = (select m.id from membros m
                                  where m.cliente_id = a.cliente_id
                                    and (lower(m.nome) = lower(btrim(split_part(a.responsavel_nome, ',', 1)))
                                         or split_part(lower(m.nome), ' ', 1) = split_part(lower(btrim(split_part(a.responsavel_nome, ',', 1))), ' ', 1))
                                  order by m.ordem limit 1)
             where a.cliente_id = %s and a.responsavel_id is null and a.responsavel_nome is not null""", (CLIENTE,))
q.execute("""update atividades a set setor_id = m.setor_id from membros m
             where a.responsavel_id = m.id and a.cliente_id = %s and a.setor_id is null""", (CLIENTE,))
ligadas = q.rowcount
c.commit()
q.execute("""select m.nome, count(a.id) from membros m left join atividades a on a.responsavel_id = m.id and a.deleted_at is null
             where m.cliente_id = %s group by m.nome, m.ordem order by m.ordem""", (CLIENTE,))
print(f"{ligadas} atividades conferidas;", ", ".join(f"{n}: {k}" for n, k in q.fetchall()))
