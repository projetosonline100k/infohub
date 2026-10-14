-- Pessoa da empresa que é uma IA (ex.: Danilo e Roy = conversas do ChatGPT
-- do Davi): link da conversa, pra abrir direto da tarefa.
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS link_ia text;
UPDATE public.membros SET eh_ia = true, funcao = 'Carrosséis (IA · ChatGPT)'
 WHERE cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f' AND nome = 'Roy';
NOTIFY pgrst, 'reload schema';
