-- Criar funcionário pelo app (pedido do Davi, 15/10/2026: "criar o personagem,
-- dizer qual vai ser a função, escolher o escritório… independente e funcional").
-- autonomo: IA que trabalha sozinha (o ouvinte pega as tarefas confirmadas dela,
--   como faz com Ítalo/Gabriel/Roy/Pedro, sem precisar de código novo).
-- manual: o que ela faz e como (vira o manual dela no briefing e na execução).
-- visual: aparência do boneco no escritório {pele, cabelo, corCabelo, barba, oculos, camisa}.
ALTER TABLE public.membros ADD COLUMN autonomo boolean NOT NULL DEFAULT false;
ALTER TABLE public.membros ADD COLUMN manual text;
ALTER TABLE public.membros ADD COLUMN visual jsonb;

-- Quem já trabalha sozinho hoje fica marcado (o código ainda reconhece pelo nome também).
UPDATE public.membros SET autonomo = true
 WHERE eh_ia AND lower(nome) IN ('ítalo', 'gabriel', 'roy', 'pedro') ;

NOTIFY pgrst, 'reload schema';
