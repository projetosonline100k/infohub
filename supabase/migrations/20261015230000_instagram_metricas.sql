-- Métricas de crescimento do Instagram (melhoria do Pedro, 15/10/2026).
-- Troca a Windsor (função instagram-insights, fora do ar desde set/2026) pela
-- conexão com a Meta que já existe em instagram_conexoes. Todo dia o pg_cron
-- chama a edge function `instagram-metricas`, que guarda seguidores, alcance e
-- visualizações de cada conta. O painel do cronograma mostra o crescimento da
-- semana e do mês do projeto. Alcance e visualizações pedem a permissão
-- instagram_business_manage_insights: a conta precisa reconectar uma vez.
CREATE TABLE public.instagram_metricas_diarias (
  ig_user_id text NOT NULL REFERENCES public.instagram_conexoes(ig_user_id) ON DELETE CASCADE,
  dia date NOT NULL,                -- dia das métricas (horário de Brasília)
  user_id uuid NOT NULL,            -- dono da conexão
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL, -- projeto (ver trigger)
  username text,
  seguidores integer,
  publicacoes integer,
  alcance integer,                  -- contas alcançadas no dia
  visualizacoes integer,            -- visualizações no dia
  erro text,                        -- ex.: falta a permissão de insights
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_user_id, dia)
);
CREATE INDEX instagram_metricas_diarias_cliente_idx ON public.instagram_metricas_diarias (cliente_id, dia);

ALTER TABLE public.instagram_metricas_diarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_metricas_diarias FROM anon, authenticated;
GRANT SELECT ON public.instagram_metricas_diarias TO authenticated;
CREATE POLICY "dono_ou_equipe_le" ON public.instagram_metricas_diarias FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (cliente_id IS NOT NULL AND public.team_allowed(cliente_id, 'conteudo', 'acessar')));

-- O projeto vem da conexão. A conexão geral (sem projeto, o @eu.davi…) vale só
-- pro projeto Davi Queiroz, a mesma regra da Dalila (20261015210000).
CREATE FUNCTION public.instagram_metricas_projeto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT c.user_id, coalesce(c.cliente_id, (
           SELECT cl.id FROM public.clientes cl
           WHERE cl.id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND cl.user_id = c.user_id))
    INTO NEW.user_id, NEW.cliente_id
  FROM public.instagram_conexoes c WHERE c.ig_user_id = NEW.ig_user_id;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER instagram_metricas_projeto BEFORE INSERT OR UPDATE ON public.instagram_metricas_diarias
  FOR EACH ROW EXECUTE FUNCTION public.instagram_metricas_projeto();

-- A chave do cron fica no Vault; a função confere sem nunca devolvê-la.
SELECT vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'instagram_metricas',
  'Chave que o pg_cron manda para a edge function instagram-metricas');
CREATE FUNCTION public.instagram_metricas_chave_ok(p_chave text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(p_chave, '') <> '' AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'instagram_metricas' AND decrypted_secret = p_chave);
$$;
REVOKE ALL ON FUNCTION public.instagram_metricas_chave_ok(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_metricas_chave_ok(text) TO service_role;
REVOKE ALL ON FUNCTION public.instagram_metricas_projeto() FROM public, anon, authenticated;

-- Todo dia às 03:10 de Brasília (06:10 UTC), as métricas do dia anterior.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('instagram-metricas', '10 6 * * *', $cron$
  SELECT net.http_post(
    url := 'https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/instagram-metricas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-metricas-chave',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_metricas')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);

NOTIFY pgrst, 'reload schema';
