-- Conexao Google Calendar. Tokens nunca sao expostos ao cliente: a tabela
-- fica sem policies para usuarios autenticados e e acessada exclusivamente
-- pela Edge Function com service role.
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;

-- Nonces descartaveis impedem CSRF no retorno do OAuth.
create table if not exists public.google_calendar_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_url text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

alter table public.google_calendar_oauth_states enable row level security;
revoke all on public.google_calendar_oauth_states from anon, authenticated;
create index if not exists google_calendar_oauth_states_expires_idx
  on public.google_calendar_oauth_states (expires_at);

