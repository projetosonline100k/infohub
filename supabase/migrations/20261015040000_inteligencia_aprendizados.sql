-- Pedido do Davi (15/10/2026): os funcionários vão aprendendo com ele. Cada
-- funcionário tem, por projeto, um item "Aprendizados com o Davi" na
-- Inteligência (tipo 'aprendizado'): as regras que ele anota quando o Davi
-- corrige ou diz como gosta (scripts/inteligencia/aprender.py). Fica visível
-- e editável na tela da Inteligência, e é lido antes de cada trabalho.
ALTER TABLE public.inteligencia_membros DROP CONSTRAINT inteligencia_membros_tipo_check;
ALTER TABLE public.inteligencia_membros ADD CONSTRAINT inteligencia_membros_tipo_check
  CHECK (tipo IN ('pdf', 'texto', 'video', 'link', 'aprendizado'));
