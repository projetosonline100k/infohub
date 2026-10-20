-- Escritório de funcionários IA — banco de partida (Postgres / Supabase).
-- Ponto de partida para adaptar: renomeie, tire ou acrescente o que o dono precisar.
-- Supõe um usuário dono (auth.users) e acesso só do dono (RLS por user_id). Se houver equipe
-- humana com acesso, troque as policies por uma função de permissão (ex.: membro do projeto).

-- Projetos/clientes (se o dono tiver mais de um negócio; senão, pode tirar e usar só user_id)
create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);

-- Salas do escritório. `esteira`: etapas em sequência (opcional), ex.:
-- [{"nome":"Roteiro","membro_id":"…","criterios":["…"],"formatos":[{"nome":"…","texto":"…"}]}, …]
create table if not exists public.setores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  nome text not null,
  cor text,
  ordem int not null default 0,
  esteira jsonb,
  cerebros jsonb not null default '[]'::jsonb   -- "para quem é" o conteúdo (seções de texto)
);

-- Funcionários (IA ou pessoa).
create table if not exists public.membros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  setor_id uuid references public.setores(id) on delete set null,
  nome text not null,
  funcao text,
  eh_ia boolean not null default true,
  ativo boolean not null default true,
  manual text,                     -- como ele trabalha (o Claude lê antes de cada tarefa)
  visual jsonb,                    -- aparência do boneco no escritório (pele, cabelo, camisa…)
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- Tarefas.
create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  responsavel_id uuid references public.membros(id) on delete set null,
  titulo text not null,
  descricao text,                  -- o combinado do briefing (entregas, limites, o que precisa do dono)
  tipo text,                       -- copy, pagina, edicao, carrossel… (o dono define)
  situacao text not null default 'fila'
    check (situacao in ('fila', 'andamento', 'aguardando_aprovacao', 'concluida')),
  progresso int check (progresso between 0 and 100),
  observacao text,                 -- a frase do momento ("Pesquisando concorrentes…")
  passos jsonb not null default '[]'::jsonb,   -- linha do tempo: [{"em","texto","tipo"}]
  data_vencimento date,
  andamento_desde timestamptz,
  concluida_em timestamptz,
  deleted_at timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists atividades_fila_idx on public.atividades (situacao, criado_em) where deleted_at is null;

-- Conversa de pedido (briefing) e de revisão da entrega.
create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  membro_id uuid not null references public.membros(id) on delete cascade,
  atividade_id uuid references public.atividades(id) on delete set null,
  status text not null default 'conversando' check (status in ('conversando', 'confirmado', 'revisando', 'encerrado')),
  proposta jsonb,                  -- {titulo, entendimento, entregas[], consigo, limites, precisa_de[], prazo_sugerido, tipo}
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.briefing_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  papel text not null check (papel in ('dono', 'funcionario')),
  membro_id uuid references public.membros(id) on delete set null,   -- quem respondeu (conversa em grupo)
  texto text not null,
  status text not null default 'enviada' check (status in ('enviada', 'lida', 'respondida')),
  criada_em timestamptz not null default now()
);
create index if not exists briefing_mensagens_idx on public.briefing_mensagens (briefing_id, criada_em);

-- Memória/conhecimento de cada funcionário (manuais extras, PDFs transcritos, skills, aprendizados).
create table if not exists public.inteligencia_membros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  membro_id uuid references public.membros(id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'pdf', 'video', 'skill', 'aprendizado')),
  escopo text not null default 'geral' check (escopo in ('geral', 'projeto')),
  nome text not null,
  conteudo text,
  status text not null default 'pronto',
  criado_em timestamptz not null default now()
);

-- Entregas em texto (o app mostra e o dono revisa).
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  atividade_id uuid references public.atividades(id) on delete set null,
  titulo text not null,
  conteudo text,                   -- HTML simples (h2, h3, p, ul, ol, li, strong, em, a, blockquote)
  deleted_at timestamptz,
  atualizado_em timestamptz not null default now()
);

-- Último sinal de vida de cada serviço do computador (a tela mostra "parado desde HH:MM").
create table if not exists public.servicos_sinal (
  user_id uuid not null references auth.users(id) on delete cascade,
  servico text not null,
  ultimo_sinal timestamptz not null default now(),
  iniciado_em timestamptz,
  primary key (user_id, servico)
);

-- Acesso: só o dono (troque por uma função de equipe se precisar).
do $$
declare t text;
begin
  foreach t in array array['projetos','setores','membros','atividades','briefings','briefing_mensagens',
                           'inteligencia_membros','documentos','servicos_sinal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono_tudo on public.%I', t);
    execute format('create policy dono_tudo on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Tempo real: a tela atualiza sozinha quando o ouvinte escreve.
-- (Supabase) alter publication supabase_realtime add table public.atividades, public.briefing_mensagens, public.briefings, public.documentos;
