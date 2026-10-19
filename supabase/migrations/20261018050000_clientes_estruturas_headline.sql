-- Radar de virais (18/10/2026, Davi: "pedir para gerar headlines com base nas estruturas que
-- vamos cadastrar"). Estruturas de headline do projeto: [{id, nome, estrutura, exemplos}].
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estruturas_headline jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
