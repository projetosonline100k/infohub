-- Regressão: conversa sobre a entrega ('revisando'). O Davi abre a conversa
-- ligada à tarefa entregue; tarefa de outro projeto é recusada; revisão sem
-- tarefa é recusada; o app não cria briefing já confirmado.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000291','rev-dono-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000291',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000292', 'Rev A', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000293', 'Rev B', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000294', '10000000-0000-0000-0000-000000000292', 'Ítalo', true);
INSERT INTO public.atividades(id, cliente_id, titulo, user_id) VALUES
 ('10000000-0000-0000-0000-000000000295', '10000000-0000-0000-0000-000000000292', 'Esboço', auth.uid()),
 ('10000000-0000-0000-0000-000000000296', '10000000-0000-0000-0000-000000000293', 'Outra', auth.uid());

INSERT INTO public.briefings(id, cliente_id, membro_id, atividade_id, status) VALUES
 ('10000000-0000-0000-0000-000000000297', '10000000-0000-0000-0000-000000000292', '10000000-0000-0000-0000-000000000294',
  '10000000-0000-0000-0000-000000000295', 'revisando');
INSERT INTO public.briefing_mensagens(briefing_id, cliente_id, papel, texto) VALUES
 ('10000000-0000-0000-0000-000000000297', '10000000-0000-0000-0000-000000000292', 'davi', 'Gostei muito do Mapa da Dispersão');
DO $$
BEGIN
  IF (SELECT status FROM public.briefing_mensagens WHERE briefing_id = '10000000-0000-0000-0000-000000000297') <> 'enviada' THEN
    RAISE EXCEPTION 'mensagem da revisão não entrou como enviada'; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.briefings(cliente_id, membro_id, atividade_id, status) VALUES
   ('10000000-0000-0000-0000-000000000292', '10000000-0000-0000-0000-000000000294', '10000000-0000-0000-0000-000000000296', 'revisando');
  RAISE EXCEPTION 'aceitou tarefa de outro projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'tarefa não é deste projeto' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.briefings(cliente_id, membro_id, status) VALUES
   ('10000000-0000-0000-0000-000000000292', '10000000-0000-0000-0000-000000000294', 'revisando');
  RAISE EXCEPTION 'aceitou revisão sem tarefa';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'revisão precisa da tarefa' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.briefings(cliente_id, membro_id, atividade_id, status) VALUES
   ('10000000-0000-0000-0000-000000000292', '10000000-0000-0000-0000-000000000294', '10000000-0000-0000-0000-000000000295', 'confirmado');
  RAISE EXCEPTION 'app criou briefing já confirmado';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'conversa nova começa conversando ou revisando' THEN RAISE; END IF;
END $$;
ROLLBACK;
