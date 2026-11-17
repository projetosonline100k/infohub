-- Kdu, gestor de tráfego (IA) do setor Marketing (17/11/2026, Davi: "adicione um novo integrante, Kdu, responsável pelo gerenciador de anúncios do Facebook Ads, com um dash funcional").
-- O Kdu lê o Gerenciador de Anúncios pelo Chrome do Davi (modo ao vivo do Mac; scripts/kdu/coletar.py), grava aqui as campanhas e os números por dia,
-- e o dash do Kdu (src/components/empresa/DashKdu.tsx) mostra gasto, resultados, custo por resultado, retorno e alertas. Ele só LÊ: não muda orçamento nem pausa nada.

-- 1) O integrante, no setor Marketing do escritório do Davi.
INSERT INTO public.membros (id, cliente_id, setor_id, user_id, nome, funcao, responsabilidades, eh_ia, autonomo, ativo, ordem)
SELECT gen_random_uuid(), c.id, '1f0bb058-d269-4a57-833c-2fd2e9231444', c.user_id, 'Kdu', 'Gestor de tráfego · Facebook Ads (IA)',
       ARRAY['gerenciador de anúncios do Facebook Ads', 'acompanhar gasto, resultados, custo por resultado e retorno das campanhas', 'avisar o que está gastando sem dar resultado e o que merece mais verba', 'sugerir testes de criativo e público (o Davi decide)'],
       true, true, true, 14
  FROM public.clientes c
 WHERE c.id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
   AND NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.cliente_id = c.id AND lower(m.nome) = 'kdu');

-- 2) Campanhas (a foto mais recente de cada uma).
CREATE TABLE public.ads_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  conta text,                               -- conta de anúncios (nome ou id act_…)
  campanha_ref text NOT NULL,               -- id da campanha no Gerenciador (ou o nome, se o id não aparecer)
  nome text NOT NULL,
  status text,                              -- ativa | pausada | arquivada | com problema
  objetivo text,
  orcamento_diario numeric,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, campanha_ref)
);
-- 3) Números por campanha e por dia.
CREATE TABLE public.ads_metricas_diarias (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  campanha_ref text NOT NULL,
  dia date NOT NULL,
  gasto numeric NOT NULL DEFAULT 0,
  impressoes bigint NOT NULL DEFAULT 0,
  alcance bigint,
  cliques bigint NOT NULL DEFAULT 0,
  resultados numeric NOT NULL DEFAULT 0,    -- o resultado que a campanha otimiza (compra, lead, mensagem…)
  tipo_resultado text,
  valor_conversao numeric NOT NULL DEFAULT 0,   -- receita atribuída (retorno = valor_conversao / gasto)
  PRIMARY KEY (cliente_id, campanha_ref, dia)
);
-- 4) Avisos do Kdu.
CREATE TABLE public.ads_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nivel text NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'atencao', 'critico')),
  titulo text NOT NULL CHECK (length(titulo) <= 160),
  detalhe text,
  campanha_ref text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);
-- 5) Pedidos de atualização e o histórico das coletas.
CREATE TABLE public.ads_coletas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'auto')),
  periodo_dias integer NOT NULL DEFAULT 30 CHECK (periodo_dias BETWEEN 1 AND 90),
  status text NOT NULL DEFAULT 'pedida' CHECK (status IN ('pedida', 'coletando', 'ok', 'erro')),
  mensagem text,
  pedida_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz
);
CREATE INDEX ads_coletas_cliente_idx ON public.ads_coletas (cliente_id, pedida_em DESC);
CREATE INDEX ads_metricas_dia_idx ON public.ads_metricas_diarias (cliente_id, dia DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ads_campanhas', 'ads_metricas_diarias', 'ads_alertas', 'ads_coletas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format($p$CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), 'conteudo', 'acessar'))$p$, t, t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;
-- O app só PEDE coleta e resolve avisos; quem grava campanhas e números é o robô do Mac (acesso de serviço).
CREATE POLICY team_grant_insert ON public.ads_coletas FOR INSERT TO authenticated
  WITH CHECK (status = 'pedida' AND origem = 'manual' AND public.team_row_allowed('ads_coletas', to_jsonb(ads_coletas.*), 'conteudo', 'criar'));
GRANT INSERT (cliente_id, periodo_dias, status, origem) ON public.ads_coletas TO authenticated;
CREATE POLICY team_grant_update ON public.ads_alertas FOR UPDATE TO authenticated
  USING (public.team_row_allowed('ads_alertas', to_jsonb(ads_alertas.*), 'conteudo', 'editar'))
  WITH CHECK (public.team_row_allowed('ads_alertas', to_jsonb(ads_alertas.*), 'conteudo', 'editar'));
GRANT UPDATE (resolvido_em) ON public.ads_alertas TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads_coletas;
NOTIFY pgrst, 'reload schema';
