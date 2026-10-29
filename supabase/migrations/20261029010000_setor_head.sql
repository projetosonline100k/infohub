-- 29/10 (Davi: "dentro da equipe, tenha um head daquele setor, pode ser a Dalila"): cada setor do Escritório pode
-- ter um head (um membro). A Dalila começa como head do Audiovisual em todos os projetos onde ela está.
alter table public.setores add column if not exists head_id uuid references public.membros(id) on delete set null;

update public.setores s set head_id = m.id
  from public.membros m
 where m.setor_id = s.id and m.ativo and lower(m.nome) = 'dalila' and s.head_id is null;
