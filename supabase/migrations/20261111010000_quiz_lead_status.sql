-- Painel do quiz (11/11/2026, Davi): cada lead ganha um status para o time acompanhar (Novo → Em contato → Convertido).
ALTER TABLE public.quiz_respostas ADD COLUMN status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'convertido'));
GRANT UPDATE (status) ON public.quiz_respostas TO authenticated;   -- só o status: o resto da resposta não se edita
NOTIFY pgrst, 'reload schema';
