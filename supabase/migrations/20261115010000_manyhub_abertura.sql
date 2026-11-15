-- Many Hub (15/11/2026, Davi: "taxa de abertura de cada mensagem, quantas pessoas, porcentagem, igual o ManyChat").
-- Cada DM de fluxo passa a guardar de qual bloco saiu (no_id) e quando a pessoa abriu (lida_em): pelo aviso de "visto" da Meta
-- ou, no mínimo, quando ela responde/clica depois (quem respondeu viu). Vale só para mensagens novas.
ALTER TABLE public.instagram_mensagens ADD COLUMN no_id text, ADD COLUMN lida_em timestamptz;
CREATE INDEX instagram_mensagens_no_idx ON public.instagram_mensagens (ig_user_id, fluxo_id, no_id) WHERE no_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
