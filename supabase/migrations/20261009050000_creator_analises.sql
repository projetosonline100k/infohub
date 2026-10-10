-- Modo Creator → "Analisar para cliente": o Davi escolhe reels transcritos e
-- um cliente (ou descreve o nicho); o pedido vai pra sessão do Claude
-- "Inteligência do Infopro" (pela Conversa do Jarvis, comando /analisar <id>),
-- que diz quais servem pro nicho e gera 5 headlines adaptadas por reel
-- (scripts/creator-analise.py). Status: pedida → rodando → pronta | erro.
CREATE TABLE IF NOT EXISTS public.creator_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  nicho_livre text,
  transcricao_ids uuid[] NOT NULL CHECK (cardinality(transcricao_ids) BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'pedida' CHECK (status IN ('pedida', 'rodando', 'pronta', 'erro')),
  -- {"itens": [{"transcricao_id", "serve", "motivo", "resumo", "headlines": [5]}], "resumo_geral"}
  resultado jsonb,
  erro text,
  criada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  CHECK (cliente_id IS NOT NULL OR length(btrim(coalesce(nicho_livre, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS creator_analises_user_criada_idx ON public.creator_analises (user_id, criada_em DESC);

ALTER TABLE public.creator_analises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_owner_select" ON public.creator_analises FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "account_owner_insert" ON public.creator_analises FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pedida' AND resultado IS NULL);
CREATE POLICY "account_owner_delete" ON public.creator_analises FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.creator_analises FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.creator_analises TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_analises;
