-- Estúdio do roteiro (13/11/2026, Davi: "ao clicar no roteiro, um editor estilo Premiere onde eu converso com o Lauro; quando ele editar, aparece 'aprovar'").
-- Novo status "revisar" (vídeo pronto, esperando o Davi aprovar) e o histórico de versões do vídeo (v1, v2…, escrito pelo Lauro).
ALTER TABLE public.esteira_dark_roteiros DROP CONSTRAINT IF EXISTS esteira_dark_roteiros_status_check;
ALTER TABLE public.esteira_dark_roteiros ADD CONSTRAINT esteira_dark_roteiros_status_check CHECK (status IN ('na_fila', 'editando', 'revisar', 'programando', 'programado', 'erro'));
ALTER TABLE public.esteira_dark_roteiros ADD COLUMN versoes jsonb NOT NULL DEFAULT '[]'::jsonb;   -- [{"arquivo": "...", "em": "...", "nota": "..."}]
NOTIFY pgrst, 'reload schema';
