-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): tira o link "← Voltar" de baixo do botão principal (o Voltar do topo fica). Só a V2 (ad802bd4…); a V1 continua igual.
UPDATE public.quizzes
   SET estrutura = jsonb_set(estrutura, '{voltar_embaixo}', 'false')
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
