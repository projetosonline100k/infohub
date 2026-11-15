-- Quiz Instalivros V2 (15/11/2026, Davi, pelo Roy): identidade visual azul-marinho com luz azul em cima e brilho roxo discreto embaixo,
-- igual em todas as telas. Só a V2 (ad802bd4…); a V1 não é tocada. Configuração em estrutura.visual (ver VisualQuiz em src/lib/quiz/quiz.ts).
UPDATE public.quizzes
   SET estrutura = estrutura || jsonb_build_object(
         'tema', 'escuro',
         'cor', '#3F63F0',
         'visual', jsonb_build_object(
           'base', '#010F24',
           'barra', '#081F4F',
           'fundo_css', 'radial-gradient(ellipse 130% 42% at 50% 0%, #081F4F 0%, rgba(8,31,79,0) 100%), radial-gradient(ellipse 110% 38% at 50% 108%, rgba(97,53,197,.34) 0%, rgba(97,53,197,0) 100%), linear-gradient(180deg, #02163A 0%, #010F24 35%, #010F24 72%, #131D59 100%)',
           'texto', '#FFFFFF',
           'texto_2', '#AAB6D0',
           'card', 'rgba(8,31,79,.5)',
           'borda_card', 'rgba(129,160,255,.25)',
           'botao', '#2CDAAB',
           'botao_texto', '#010F24'))
 WHERE id = 'ad802bd4-7a2e-4cc7-9a70-d36d02bebfc7';
