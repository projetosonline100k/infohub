-- Roteiros do Core Clone: o app grava só roteiro e perfil (nunca link, arquivo ou status do robô); anon não vê nada.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.clone_roteiros', 'SELECT') THEN RAISE EXCEPTION 'anon não lê roteiros'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.clone_roteiros', 'SELECT') THEN RAISE EXCEPTION 'o dono precisa ler'; END IF;
  IF has_column_privilege('authenticated', 'public.clone_roteiros', 'video_url', 'INSERT') OR has_column_privilege('authenticated', 'public.clone_roteiros', 'video_url', 'UPDATE') THEN RAISE EXCEPTION 'o app não grava o link do vídeo'; END IF;
  IF has_column_privilege('authenticated', 'public.clone_roteiros', 'arquivo', 'UPDATE') THEN RAISE EXCEPTION 'o app não grava o arquivo'; END IF;
  IF has_column_privilege('authenticated', 'public.clone_roteiros', 'status', 'INSERT') THEN RAISE EXCEPTION 'insert sempre entra na fila (default)'; END IF;
  IF NOT has_column_privilege('authenticated', 'public.clone_roteiros', 'roteiro', 'INSERT') THEN RAISE EXCEPTION 'o app precisa gravar o roteiro'; END IF;
END $$;
ROLLBACK;
