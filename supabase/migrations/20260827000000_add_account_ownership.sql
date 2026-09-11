-- Isola os dados do painel por usuário autenticado.
-- Os registros já existentes são atribuídos à conta proprietária informada.
DO $$
DECLARE
  table_name text;
  account_id uuid;
  protected_tables text[] := ARRAY[
    'agentes_ia', 'atividades', 'categorias_nucleo', 'clientes',
    'conhecimentos_agente', 'documentos', 'equipe_cliente',
    'funil_categorias', 'funil_vendas', 'ideias_conteudo', 'nucleo_influencia',
    'perfis_parecidos', 'produto_financeiro', 'produto_financeiro_diario',
    'produtos_cliente', 'subtarefas_atividade', 'tags_video', 'termos_virais',
    'videos_referencia', 'videos_vertical', 'videos_vertical_tags', 'videos_youtube'
  ];
BEGIN
  SELECT id INTO account_id
  FROM auth.users
  WHERE lower(email) = 'eu.daviqueiroz22@gmail.com'
  LIMIT 1;

  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE', table_name);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT auth.uid()', table_name);
    IF account_id IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE user_id IS NULL', table_name) USING account_id;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "account_owner_select" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "account_owner_insert" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "account_owner_update" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "account_owner_delete" ON public.%I', table_name);
    EXECUTE format('CREATE POLICY "account_owner_select" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', table_name);
    EXECUTE format('CREATE POLICY "account_owner_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', table_name);
    EXECUTE format('CREATE POLICY "account_owner_update" ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', table_name);
    EXECUTE format('CREATE POLICY "account_owner_delete" ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', table_name);
  END LOOP;
END $$;

-- O formulário público continua podendo carregar pesquisas publicadas e enviar respostas.
ALTER TABLE public.pesquisas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas_pesquisa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_pesquisa ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE account_id uuid;
BEGIN
  SELECT id INTO account_id FROM auth.users
    WHERE lower(email) = 'eu.daviqueiroz22@gmail.com' LIMIT 1;
  ALTER TABLE public.respostas_pesquisa ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.respostas_pesquisa ALTER COLUMN user_id SET DEFAULT auth.uid();
  IF account_id IS NOT NULL THEN
    UPDATE public.respostas_pesquisa SET user_id = account_id WHERE user_id IS NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "public_read_published_surveys" ON public.pesquisas;
CREATE POLICY "public_read_published_surveys" ON public.pesquisas
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_survey_questions" ON public.perguntas_pesquisa;
CREATE POLICY "public_read_survey_questions" ON public.perguntas_pesquisa
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_submit_survey_answers" ON public.respostas_pesquisa;
CREATE POLICY "public_submit_survey_answers" ON public.respostas_pesquisa
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "account_read_survey_answers" ON public.respostas_pesquisa;
CREATE POLICY "account_read_survey_answers" ON public.respostas_pesquisa
  FOR SELECT TO authenticated USING (user_id = auth.uid());
