# Infopro Hub

Sistema interno de gestão de "Projetos Milionários" (especialistas/infoprodutores): clientes, produtos, conteúdo, atividades da equipe, documentos e produtividade pessoal. Web (Vercel: https://infopro-hub.vercel.app) + desktop (Tauri, com a orbe flutuante "Jarvis"). Idioma do código, do banco e da UI: português.

## Stack

- React 18 + Vite + TypeScript + Tailwind + shadcn/ui. Projeto nasceu no Lovable.
- Supabase (projeto `ucjyobemrxqfcoopkcgb`): Postgres com RLS, Auth, Storage, Edge Functions (Deno).
- Desktop: Tauri v2 em `src-tauri/` + wrappers em `src/lib/desktop/*`, sempre atrás de `isDesktop()` (`src/lib/platform.ts`). Detalhes em `docs/DESKTOP.md`.
- Editores: TipTap (documentos/notas, extensões em `src/lib/tiptap*.ts`), Excalidraw (lousa), mapa mental próprio.
- Arquivos de vídeo grandes vão para Backblaze B2 (edge function `backblaze-upload-url`).

## Comandos

- `npm run dev` — web. `npm run tauri dev` — desktop.
- `npm run build`, `npm run lint`.
- Testes JS: `node --test tests/*.test.mjs` (o glob é necessário; `node --test tests/` falha).
- Testes SQL de RLS: `python3 scripts/run-sql-tests.py` (roda `supabase/tests/*.sql` em savepoint com rollback).

## Mapa do app

Rotas públicas (`src/App.tsx`): `/login`, `/redefinir-senha`, `/formulario/:slug` (pesquisa pública), `/compartilhado/:token` (documento compartilhado), `/jarvis` (janela desktop da orbe).
Rotas internas (sidebar, `src/components/layout/AppSidebar.tsx`):

| Menu | Rota | Página | O que é |
|---|---|---|---|
| Dash geral | `/` | `DashGeral.tsx` | faturamento + produtividade agregados |
| Projetos Milionários | `/clientes`, `/clientes/:id` | `Clientes.tsx`, `ClienteDetalhe.tsx` | cada cliente/especialista e tudo dele |
| Atividades | `/atividades` | `Atividades.tsx` | kanban, lista, lousa, por cliente |
| Notas | `/notas` | `Notas.tsx` | notas pessoais com pastas |
| Produtividade | `/produtividade` | `Produtividade.tsx` | performance (rotinas/metas), sono, relatórios de foco |
| Agenda | `/agenda` | `Agenda.tsx` | eventos, alarmes, sync com Google Calendar (`docs/GOOGLE_CALENDAR.md`) |
| Administração | `/admin` | `Admin.tsx` | só para o e-mail admin (`src/lib/admin.ts`) |

Componentes por domínio em `src/components/<dominio>/`; lógica pura em `src/lib/<dominio>/`; hooks de dados em `src/hooks/` (o Assistant/Jarvis usa `useAssistant*`, produtividade usa `usePerformance*`, `useSleep*`, `useDailyPlan`, `useStartDay*`, `useEndOfDay*`).

## Modelo de dados (schema `public`)

Quase toda tabela tem `user_id` (dono) e muitas têm `cliente_id`. Soft delete via `deleted_at` em `atividades`, `documentos`, `pastas_atividade`.

**Clientes e negócio**
- `clientes` — o especialista: `nome_especialista`, `nicho`, `meta_atual`, `arquivado`, `planilha_referencias_url`.
- `produtos_cliente` (status: `Ativo` | `Planejado` | `Pausado`), `produto_financeiro` (mensal), `produto_financeiro_diario` (receita, custos, reembolsos, vendas por dia).
- `funil_vendas` + `funil_categorias` — funil visual do produto (nós com `parent_id`, posição x/y).
- `equipe_cliente` — membros da equipe por cliente: `nome_pessoa`, `email`, `papel` (ex.: Joker, Expert, Head, Copy, Coprodutor), `clientes_permitidos`, `permissoes`.

**Atividades**
- `atividades` — `titulo`, `status` (= `status_key` de uma coluna: `backlog`, `em_progresso`, `revisao`, `finalizado` ou colunas customizadas), `prioridade` (`media`/`alta`), `data_vencimento`, `responsavel_nome`, `pasta_id`, timer (`timer_iniciado_em`, `timer_decorrido_segundos`), `concluida_em` (trigger `set_atividade_concluida_em`), `alarme_em`.
- `colunas_atividade` — colunas do kanban por cliente; `eh_conclusao` marca a coluna que conclui.
- `pastas_atividade` (`origem`: `atividades` | `documentos`), `subtarefas_atividade`.

**Conteúdo**
- `videos_vertical` (status: `ideia` → `roteiro` → … → `postado`; `roteiro`, arquivos bruto/editado, `ideia_origem_id`), `videos_youtube`, `tags_video`/`videos_vertical_tags`.
- `ideias_conteudo`, `videos_referencia` (com `transcricao`, `visualizacoes`), `perfis_parecidos`, `termos_virais`.
- `nucleo_influencia` + `categorias_nucleo` — posicionamento do especialista.
- `agentes_ia` + `conhecimentos_agente` — agente de IA por cliente (edge `chat`, PDFs via `process-pdf`).

**Pesquisas**: `pesquisas` (formulário público com banner/mensagens), `perguntas_pesquisa`, `respostas_pesquisa` (agrupadas por `respondente_id`).

**Documentos**: `documentos` (conteúdo TipTap, `fixado`), `documento_pastas`, `compartilhamentos` (token) + `compartilhamento_acessos` (e-mails liberados). Ver `docs/COMPARTILHAMENTO.md`.

**Produtividade pessoal**
- `daily_plans` + `daily_plan_activities` (início do dia: prioridade principal, tempo de foco), `daily_productivity_reports` (fim do dia: scores, tempos de foco/distração, top apps).
- `focus_activity_events` (app/janela ativa monitorada pelo desktop, `classification`), `focus_learned_rules`, `focus_sessions`.
- `performance_pillars` → `performance_habits` → `performance_habit_logs`; `performance_goals`.
- `sleep_logs`, `sleep_goals`.
- `jarvis_configuracoes`, `jarvis_mensagens` (mensagens/nudges da orbe).

**Integrações**: `google_calendar_connections` (tokens criptografados), `google_calendar_oauth_states`.

## Permissões (RLS)

Acesso por dono + equipe. Funções: `team_allowed`, `team_access`, `team_row_allowed`, `team_row_client`, `team_stamp_owner` (carimba o dono em inserts de membros), `validate_team_member`. Membro da equipe vê os clientes de `clientes_permitidos`. Cuidado conhecido: em `INSERT ... RETURNING` a policy de SELECT roda antes da linha ficar visível para `team_allowed` (STABLE) — por isso a migração `20260911010000` checa o dono direto na linha. Toda mudança de policy deve ganhar teste em `supabase/tests/`.

## Edge functions (`supabase/functions/`)

`admin-users`, `chat` (usa `LOVABLE_API_KEY`), `process-pdf`, `backblaze-upload-url` (segredos `B2_*`), `instagram-insights` (Windsor), `google-calendar`. Checar quais estão no ar: `node scripts/check-edge-functions.mjs`.

## Consultar dados reais (somente leitura)

Para perguntas sobre o estado do negócio ("quais atividades atrasadas?", "como está o cliente X?"), use:

```
python3 scripts/consulta.py --tabelas
python3 scripts/consulta.py --colunas atividades
python3 scripts/consulta.py "select ... "
```

- A transação é `READ ONLY` (escritas falham no Postgres), com timeout de 20s e limite de 500 linhas.
- Conexão via `scripts/migration_db.py`, que lê `.env.migration.local` (git-ignored; usuário admin do banco — nunca imprimir nem copiar essas credenciais).
- Depende de `pg8000`/`certifi` em `/private/tmp/infopro-db-check`. Se sumir: `pip3 install --target /private/tmp/infopro-db-check pg8000 certifi`.
- Filtre `deleted_at is null` e, quando fizer sentido, `clientes.arquivado = false`.
- Escritas no banco só com pedido explícito do usuário, via migração em `supabase/migrations/` ou um script `scripts/apply-*.py` revisado.

## Convenções

- Nomes em português (tabelas, colunas, componentes, hooks), exceto módulos de produtividade (`daily_plans`, `performance_*`, `sleep_*`) que estão em inglês.
- Migrações novas em `supabase/migrations/` com timestamp; aplicadas via `scripts/apply-*.py` e registradas em `supabase_migrations.schema_migrations`. Depois de mudar schema: `scripts/reload-postgrest-schema.py`.
- Histórico da migração de Supabase (set/2026): `MIGRATION_STATUS.md`.
