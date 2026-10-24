-- Ponte Claude de voz → Claude Code (24/10, Davi): o Claude de voz grava o pedido aqui, o serviço do Mac
-- (scripts/ponte.py, LaunchAgent com.infoprohub.ponte) pega, roda o Claude Code e devolve o resultado.
-- Só a conexão de serviço/admin enxerga: RLS ligada e nenhuma policy (o app e o público não leem nem escrevem).
create table if not exists public.ponte_pedidos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  origem text not null default 'claude_voz',
  titulo text not null,
  descricao text not null,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluido', 'erro', 'aguardando_aprovacao')),
  requer_aprovacao boolean not null default true,
  aprovado boolean not null default false,
  resultado text,
  erro text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  constraint ponte_pedidos_titulo_preenchido check (length(btrim(titulo)) > 0),
  constraint ponte_pedidos_descricao_preenchida check (length(btrim(descricao)) > 0)
);

create index if not exists ponte_pedidos_fila_idx on public.ponte_pedidos (status, criado_em) where status in ('pendente', 'aguardando_aprovacao');

alter table public.ponte_pedidos enable row level security;
revoke all on public.ponte_pedidos from anon, authenticated;
