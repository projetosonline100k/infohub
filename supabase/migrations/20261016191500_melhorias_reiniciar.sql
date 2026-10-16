-- Melhoria "feita" que não roda (16/10/2026): a cobrança do Atlas foi pra Feito
-- às 10:07, mas o ouvinte no ar era das 09:33 e seguiu com o código antigo.
-- Ao juntar, o Pedro (scripts/pedro/melhorias.py) grava aqui os serviços que a
-- mudança mexeu e que só pegam código novo reiniciando ('ouvinte', 'danilo',
-- 'roy'). O kanban mostra "falta reiniciar" enquanto o iniciado_em do serviço
-- (servicos_sinal) for mais antigo que o concluido_em do cartão.
ALTER TABLE public.melhorias_sistema ADD COLUMN IF NOT EXISTS reiniciar text[];

-- O cartão da cobrança (commit 13bb666) mexeu no próprio ouvinte.
UPDATE public.melhorias_sistema SET reiniciar = ARRAY['ouvinte']
 WHERE id = '3bb2e3e3-07ff-4820-94c1-042f09587b7b' AND reiniciar IS NULL;

NOTIFY pgrst, 'reload schema';
