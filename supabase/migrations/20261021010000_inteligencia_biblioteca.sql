-- Biblioteca geral da inteligência (21/10, Davi: "todas as contas novas com acesso à inteligência; os
-- conhecimentos dos meus que podem ser gerais, pode passar também"). Item marcado `compartilhado` vale
-- para os funcionários de TODAS as contas (lido por scripts/inteligencia/ler.py como [biblioteca]).
-- Aprendizados e o que é sobre o perfil de alguém nunca são compartilhados.
ALTER TABLE public.inteligencia_membros ADD COLUMN IF NOT EXISTS compartilhado boolean NOT NULL DEFAULT false;
ALTER TABLE public.inteligencia_membros DROP CONSTRAINT IF EXISTS inteligencia_compartilhado_nao_aprendizado;
ALTER TABLE public.inteligencia_membros ADD CONSTRAINT inteligencia_compartilhado_nao_aprendizado
  CHECK (NOT compartilhado OR (tipo <> 'aprendizado' AND escopo = 'geral'));

-- O que do Davi é geral: as skills de roteiro viral (uma cópia só, a do Elias; o Junior tem as mesmas)
-- e os dois materiais de quiz do Ítalo.
UPDATE public.inteligencia_membros i SET compartilhado = true
  FROM auth.users u
 WHERE u.id = i.user_id AND lower(u.email) = 'eu.daviqueiroz22@gmail.com' AND i.escopo = 'geral'
   AND ((i.agente = 'elias' AND i.nome LIKE 'Skill:%') OR (i.agente = 'ítalo' AND i.nome ILIKE '%quiz%'));
