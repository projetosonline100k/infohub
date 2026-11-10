-- Regressão: o chatbot só aparece publicado; o lead entra pelo RPC (de fora, sem login), atualiza a cada etapa e
-- não deixa um chatbot sobrescrever o lead de outro; chatbot sem etapas não publica.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000261','chatbot-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000261',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id)
 VALUES ('10000000-0000-0000-0000-000000000263', 'Chatbot teste', 30, 'x', '10000000-0000-0000-0000-000000000261');
INSERT INTO public.chatbots(id, cliente_id, nome, slug, config) VALUES
 ('10000000-0000-0000-0000-000000000264', '10000000-0000-0000-0000-000000000263', 'A', 'bot-teste-a', '{"etapas":[{"id":"e1"}]}'),
 ('10000000-0000-0000-0000-000000000265', '10000000-0000-0000-0000-000000000263', 'B', 'bot-teste-b', '{"etapas":[{"id":"e1"}]}');

DO $$
BEGIN
  IF public.chatbot_publico('bot-teste-a')->>'status' <> 'rascunho' THEN RAISE EXCEPTION 'rascunho não abre pelo link'; END IF;
  BEGIN
    PERFORM public.chatbot_salvar_lead('bot-teste-a', '10000000-0000-0000-0000-000000000266', '{}', 0, 0, null, '{}');
    RAISE EXCEPTION 'salvou lead de chatbot não publicado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'chatbot não encontrado' THEN RAISE; END IF; END;
  UPDATE public.chatbots SET status = 'pausado' WHERE id = '10000000-0000-0000-0000-000000000265';
  IF public.chatbot_publico('bot-teste-b') IS NOT NULL THEN RAISE EXCEPTION 'pausado abriu pelo link'; END IF;
  UPDATE public.chatbots SET status = 'publicado' WHERE id IN ('10000000-0000-0000-0000-000000000264', '10000000-0000-0000-0000-000000000265');
  IF public.chatbot_publico('bot-teste-a')->>'nome' <> 'A' THEN RAISE EXCEPTION 'não achou o publicado'; END IF;
  PERFORM public.chatbot_salvar_lead('bot-teste-a', '10000000-0000-0000-0000-000000000266', '{"nome":"Ana","whatsapp":"11999"}', 1, 2, null, '{"utm_source":"ig"}');
  PERFORM public.chatbot_salvar_lead('bot-teste-a', '10000000-0000-0000-0000-000000000266', '{"nome":"Ana","whatsapp":"11999","email":"a@b.co"}', 3, 7, 'qualificado', '{}');
  IF (SELECT count(*) FROM public.chatbot_leads WHERE id = '10000000-0000-0000-0000-000000000266') <> 1 THEN RAISE EXCEPTION 'duplicou o lead'; END IF;
  IF (SELECT score FROM public.chatbot_leads WHERE id = '10000000-0000-0000-0000-000000000266') <> 7 THEN RAISE EXCEPTION 'não atualizou'; END IF;
  IF (SELECT utm->>'utm_source' FROM public.chatbot_leads WHERE id = '10000000-0000-0000-0000-000000000266') <> 'ig' THEN RAISE EXCEPTION 'perdeu a origem'; END IF;
  -- o outro chatbot não sobrescreve o lead
  PERFORM public.chatbot_salvar_lead('bot-teste-b', '10000000-0000-0000-0000-000000000266', '{"nome":"Hacker"}', 9, 9, 'x', '{}');
  IF (SELECT nome FROM public.chatbot_leads WHERE id = '10000000-0000-0000-0000-000000000266') <> 'Ana' THEN RAISE EXCEPTION 'sobrescreveu lead de outro chatbot'; END IF;
  BEGIN
    INSERT INTO public.chatbots(cliente_id, nome, status, config) VALUES ('10000000-0000-0000-0000-000000000263', 'vazio', 'publicado', '{}');
    RAISE EXCEPTION 'publicou sem etapas';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'chatbot sem etapas%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
