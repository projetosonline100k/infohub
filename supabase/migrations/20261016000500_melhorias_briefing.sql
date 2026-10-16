-- Pedido do Davi (16/10/2026): "quando o Pedro implementar algo, preciso que
-- ele me traga um briefing de como ficou, como pode ser usado, o que mudou".
-- `briefing`: texto do Pedro (seções: o que mudou, onde fica, como usar, o que
-- testar, limites). Só ele escreve (conexão de admin); o app lê.
ALTER TABLE public.melhorias_sistema ADD COLUMN briefing text;
NOTIFY pgrst, 'reload schema';
