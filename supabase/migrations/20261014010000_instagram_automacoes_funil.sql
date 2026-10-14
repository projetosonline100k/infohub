-- Funil das automações do Instagram: gatilho → DM enviada → clicou no link
-- → respondeu a DM. Os links da DM passam por um redirecionador da edge
-- function (/l/<disparo>/<n>) que conta o clique; a resposta é marcada quando
-- a pessoa manda mensagem depois de receber a DM.
BEGIN;

ALTER TABLE public.instagram_automacoes
  ADD COLUMN rastrear_links boolean NOT NULL DEFAULT true;

ALTER TABLE public.instagram_automacao_disparos
  ADD COLUMN links text[] NOT NULL DEFAULT '{}',   -- destinos originais, na ordem da mensagem
  ADD COLUMN cliques integer NOT NULL DEFAULT 0,
  ADD COLUMN clicou_em timestamptz,                -- primeiro clique
  ADD COLUMN respondeu_em timestamptz;             -- primeira mensagem da pessoa depois da DM

CREATE INDEX instagram_automacao_disparos_autor_idx
  ON public.instagram_automacao_disparos (user_id, autor_id, criado_em DESC);

NOTIFY pgrst, 'reload schema';
COMMIT;
