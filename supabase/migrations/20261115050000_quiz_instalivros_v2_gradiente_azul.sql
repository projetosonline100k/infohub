-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): "o fundo ficou preto demais e perdeu o efeito". Gradiente mais azul: base #010F24 → #02163A,
-- faixas em azul royal (#0A2A66) e de apoio (#1E3FAF), índigo #131D59 embaixo e brilho roxo #6135C5 suave. Só a V2 (ad802bd4…); a V1 não é tocada.
UPDATE public.quizzes
   SET estrutura = jsonb_set(estrutura, '{visual}', (estrutura->'visual') || jsonb_build_object(
         'base', '#010F24',
         'barra', '#02163A',
         'fundo_css', 'radial-gradient(ellipse 120% 40% at 50% -4%, rgba(30,63,175,.55) 0%, rgba(30,63,175,0) 100%), radial-gradient(ellipse 90% 30% at 100% 45%, rgba(10,42,102,.65) 0%, rgba(10,42,102,0) 100%), radial-gradient(ellipse 90% 26% at 0% 70%, rgba(10,42,102,.5) 0%, rgba(10,42,102,0) 100%), radial-gradient(ellipse 110% 36% at 50% 106%, rgba(97,53,197,.38) 0%, rgba(97,53,197,0) 100%), linear-gradient(180deg, #02163A 0%, #0A2A66 22%, #02163A 48%, #010F24 74%, #131D59 100%)'))
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7' AND estrutura ? 'visual';
