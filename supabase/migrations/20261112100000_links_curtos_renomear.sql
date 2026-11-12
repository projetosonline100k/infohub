-- Renomear o link curto (12/11/2026, Davi: "quero conseguir renomear o link"): o código (infopro-hub.vercel.app/r/<codigo>) passa a poder ser trocado pelo dono.
-- Os cliques e o destino ficam; o código antigo deixa de funcionar. A chave primária e o formato (a-z, 0-9, hífen) continuam garantindo que nunca haja dois iguais.
GRANT UPDATE (codigo) ON public.links_curtos TO authenticated;
NOTIFY pgrst, 'reload schema';
