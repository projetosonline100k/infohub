-- Pedido do Davi (16/10/2026): "quero conseguir mover para trás também, tipo do lado
-- da diretoria". Cada escritório guarda em que fileira do mapa ele fica:
-- 0 = fundo (onde a Diretoria fica), 1 = frente. Sem valor (NULL): o de sempre
-- (Diretoria no fundo, o resto na frente). Muda arrastando a placa no Escritório.
ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS fileira smallint CHECK (fileira IN (0, 1));
GRANT UPDATE (fileira) ON public.setores TO authenticated;
NOTIFY pgrst, 'reload schema';
