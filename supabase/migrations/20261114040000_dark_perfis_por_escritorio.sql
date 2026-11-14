-- Cada escritório (projeto) com o seu Lauro e os seus perfis dark (14/11/2026, Davi: "quero criar um novo Lauro, puxar a lógica dele, o dash e tals").
-- A lógica do Lauro é a mesma (código + instruções), mas o dash de cada escritório lista só os perfis dele. `escritorio_cliente_id` = o projeto do escritório onde o perfil mora.
ALTER TABLE public.esteira_dark_perfis ADD COLUMN escritorio_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX esteira_dark_perfis_escritorio_idx ON public.esteira_dark_perfis (escritorio_cliente_id);
-- Os perfis que já existem pertencem ao Lauro original (o do projeto onde ele foi criado).
UPDATE public.esteira_dark_perfis SET escritorio_cliente_id = (SELECT cliente_id FROM public.membros WHERE nome = 'Lauro' AND eh_ia ORDER BY created_at LIMIT 1) WHERE escritorio_cliente_id IS NULL;
GRANT INSERT (escritorio_cliente_id) ON public.esteira_dark_perfis TO authenticated;
NOTIFY pgrst, 'reload schema';
