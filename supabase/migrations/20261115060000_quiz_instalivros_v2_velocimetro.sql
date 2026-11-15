-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): perguntas de escala viram velocímetro com ponteiro arrastável. Só a V2 (ad802bd4…); a V1 mantém a trilha reta.
UPDATE public.quizzes
   SET estrutura = jsonb_set(estrutura, '{escala_visual}', '"velocimetro"')
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
