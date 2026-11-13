-- Idempotência do fluxo: a Meta reenvia webhooks; o mesmo comentário/mensagem nunca começa duas vezes o mesmo fluxo.
ALTER TABLE public.instagram_fluxo_execucoes ADD COLUMN evento_id text;
CREATE UNIQUE INDEX instagram_fluxo_execucao_evento_uq ON public.instagram_fluxo_execucoes (fluxo_id, evento_id) WHERE evento_id IS NOT NULL;
