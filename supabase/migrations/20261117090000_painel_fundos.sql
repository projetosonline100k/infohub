-- Imagem de fundo de cada projeto na Visão da semana (17/11/2026, Davi: "em cada bloco, eu preciso conseguir subir imagens para ser usado de fundo").
-- A imagem vai para o bucket público painel-fundos (pasta = id de quem subiu); a tabela guarda qual é a de cada projeto. Pessoal de cada usuário.
CREATE TABLE public.painel_fundos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (length(url) <= 600),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cliente_id)
);
ALTER TABLE public.painel_fundos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.painel_fundos FROM anon, authenticated;
CREATE POLICY dono_le ON public.painel_fundos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY dono_cria ON public.painel_fundos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_muda ON public.painel_fundos FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dono_apaga ON public.painel_fundos FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, DELETE ON public.painel_fundos TO authenticated;
GRANT INSERT (cliente_id, url) ON public.painel_fundos TO authenticated;
GRANT UPDATE (url, atualizado_em) ON public.painel_fundos TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('painel-fundos', 'painel-fundos', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']) ON CONFLICT (id) DO NOTHING;
CREATE POLICY painel_fundos_sobe ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'painel-fundos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY painel_fundos_apaga ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'painel-fundos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
