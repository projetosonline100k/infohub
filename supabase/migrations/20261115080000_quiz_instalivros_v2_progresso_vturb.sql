-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): barra de fases estilo vturb (corre rápido no começo de cada etapa e desacelera). Só a V2 (ad802bd4…); a V1 continua linear.
UPDATE public.quizzes
   SET estrutura = jsonb_set(estrutura, '{progresso}', '"vturb"')
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
