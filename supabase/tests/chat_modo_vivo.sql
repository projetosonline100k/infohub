-- Regressão: quem não é o Davi não liga o modo vivo; o autor da mensagem é sempre quem escreveu (não dá para forjar);
-- o servidor (sem login) consegue ligar.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000281','vivo-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000281',true);
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES ('10000000-0000-0000-0000-000000000283', 'Vivo', 30, 'x', '10000000-0000-0000-0000-000000000281');
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES ('10000000-0000-0000-0000-000000000284', '10000000-0000-0000-0000-000000000283', 'Roy', true);
INSERT INTO public.briefings(id, cliente_id, membro_id) VALUES ('10000000-0000-0000-0000-000000000285', '10000000-0000-0000-0000-000000000283', '10000000-0000-0000-0000-000000000284');
DO $$
BEGIN
  BEGIN
    UPDATE public.briefings SET modo_vivo = true WHERE id = '10000000-0000-0000-0000-000000000285';
    RAISE EXCEPTION 'outra pessoa ligou o modo vivo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'só o Davi%' THEN RAISE; END IF; END;
  INSERT INTO public.briefing_mensagens(briefing_id, cliente_id, papel, texto, autor_id)
    VALUES ('10000000-0000-0000-0000-000000000285', '10000000-0000-0000-0000-000000000283', 'davi', 'oi', '10000000-0000-0000-0000-0000000000ff');
  IF (SELECT autor_id FROM public.briefing_mensagens WHERE briefing_id = '10000000-0000-0000-0000-000000000285') <> '10000000-0000-0000-0000-000000000281' THEN
    RAISE EXCEPTION 'autor forjado';
  END IF;
END $$;
-- o servidor (sem login): pode ligar
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.briefings SET modo_vivo = true WHERE id = '10000000-0000-0000-0000-000000000285';
ROLLBACK;
