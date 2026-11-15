-- Link para uma versão específica do quiz (15/11/2026, Davi: "ao gerar o link, eu deveria escolher a versão do quiz"):
-- destino NULL = o link principal (sorteia entre o original e as versões do teste A/B); 'v1' = só o original (o endereço leva ?ab=0 e pula o sorteio);
-- um endereço (ex.: instalivros-v2) = só aquela versão.
ALTER TABLE public.quiz_links ADD COLUMN destino text;
GRANT SELECT (destino), INSERT (destino) ON public.quiz_links TO authenticated;
NOTIFY pgrst, 'reload schema';
