-- Execute após as migrações em um banco local/de teste: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_permissions.sql
-- Nenhum fixture persiste: a transação termina em ROLLBACK.
BEGIN;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000001','team-test-owner@example.com',now()),
 ('10000000-0000-0000-0000-000000000002','team-test-reader@example.com',now()),
 ('10000000-0000-0000-0000-000000000003','team-test-outsider@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.clientes (id,nome_especialista,idade,nicho) VALUES
 ('20000000-0000-0000-0000-000000000001','Compartilhado',30,'Teste'),
 ('20000000-0000-0000-0000-000000000002','Privado',30,'Teste');
INSERT INTO public.equipe_cliente (cliente_id,nome_pessoa,papel,email,permissoes) VALUES
 ('20000000-0000-0000-0000-000000000001','Leitor','Revisor','team-test-reader@example.com','{"documentos":{"acessar":true,"criar":false,"editar":false}}');
INSERT INTO public.documentos (id,cliente_id,titulo) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Documento compartilhado'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Documento privado');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$
DECLARE changed integer;
BEGIN
 IF NOT public.team_allowed('20000000-0000-0000-0000-000000000001','documentos','acessar') THEN RAISE EXCEPTION 'Leitor deveria acessar documentos'; END IF;
 IF public.team_allowed('20000000-0000-0000-0000-000000000001','pesquisa','acessar') THEN RAISE EXCEPTION 'Pesquisa deveria ser negada'; END IF;
 IF (SELECT count(*) FROM public.clientes WHERE id IN ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')) <> 1 THEN RAISE EXCEPTION 'Isolamento de clientes falhou'; END IF;
 IF (SELECT count(*) FROM public.documentos WHERE id IN ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')) <> 1 THEN RAISE EXCEPTION 'Isolamento de documentos falhou'; END IF;
 UPDATE public.documentos SET titulo = 'Não autorizado' WHERE id = '30000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Leitor conseguiu editar'; END IF;
 DELETE FROM public.documentos WHERE id = '30000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Leitor conseguiu excluir'; END IF;
 BEGIN
   INSERT INTO public.documentos (cliente_id,titulo) VALUES ('20000000-0000-0000-0000-000000000001','Negado');
   RAISE EXCEPTION 'Leitor conseguiu criar';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
UPDATE public.equipe_cliente SET permissoes = '{"documentos":{"acessar":true,"criar":true,"editar":true}}', clientes_permitidos = ARRAY['20000000-0000-0000-0000-000000000002']::uuid[] WHERE email = 'team-test-reader@example.com';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$
DECLARE changed integer;
BEGIN
 IF NOT public.team_allowed('20000000-0000-0000-0000-000000000002','documentos','acessar') THEN RAISE EXCEPTION 'Acesso ao segundo cliente falhou'; END IF;
 INSERT INTO public.documentos (cliente_id,titulo) VALUES ('20000000-0000-0000-0000-000000000001','Criado pelo membro');
 UPDATE public.documentos SET titulo = 'Edição autorizada' WHERE id = '30000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Editor não conseguiu editar'; END IF;
 IF public.team_allowed('20000000-0000-0000-0000-000000000001','documentos','excluir') THEN RAISE EXCEPTION 'Editor conseguiu excluir'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DELETE FROM public.equipe_cliente WHERE email = 'team-test-reader@example.com';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF public.team_allowed('20000000-0000-0000-0000-000000000001','documentos','acessar') THEN RAISE EXCEPTION 'Revogação falhou'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
