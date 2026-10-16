-- Kanban do Pedro (pedido do Davi, 15/10/2026): "quando for registrando ideia,
-- eu consigo clicar nela e colocar ainda mais detalhes, até gravar um áudio".
-- `notas`: o que o Davi acrescenta (texto ou áudio transcrito); o Pedro lê antes de implementar.
ALTER TABLE public.melhorias_sistema ADD COLUMN notas text;
GRANT UPDATE (notas) ON public.melhorias_sistema TO authenticated;
NOTIFY pgrst, 'reload schema';
