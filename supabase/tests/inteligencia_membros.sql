-- Regressão: a inteligência de um funcionário é do projeto (ou geral do
-- dono), o nome do funcionário vira a chave, o app não lê o token, o Mac
-- conclui só com o token certo e o Storage só aceita a pasta de um projeto
-- que a pessoa pode editar.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000171','intel-dono-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000172','intel-alheio-test@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000171',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.clientes(id, nome_especialista, idade, nicho, user_id) VALUES
 ('10000000-0000-0000-0000-000000000173', 'Intel A', 30, 'x', auth.uid()),
 ('10000000-0000-0000-0000-000000000174', 'Intel B', 30, 'x', auth.uid());
INSERT INTO public.membros(id, cliente_id, nome, eh_ia) VALUES
 ('10000000-0000-0000-0000-000000000175', '10000000-0000-0000-0000-000000000173', 'Ítalo', true),
 ('10000000-0000-0000-0000-000000000176', '10000000-0000-0000-0000-000000000174', 'Ítalo', true);

-- Livro geral no projeto A, voz só do projeto A.
INSERT INTO public.inteligencia_membros(id, cliente_id, membro_id, agente, escopo, tipo, nome, conteudo) VALUES
 ('10000000-0000-0000-0000-000000000177', '10000000-0000-0000-0000-000000000173', '10000000-0000-0000-0000-000000000175', 'x', 'geral', 'pdf', 'Livro', 'texto do livro'),
 ('10000000-0000-0000-0000-000000000178', '10000000-0000-0000-0000-000000000173', '10000000-0000-0000-0000-000000000175', 'x', 'projeto', 'texto', 'Voz A', 'voz do A');
INSERT INTO public.inteligencia_membros(id, cliente_id, membro_id, agente, tipo, nome, status, link) VALUES
 ('10000000-0000-0000-0000-000000000179', '10000000-0000-0000-0000-000000000173', '10000000-0000-0000-0000-000000000175', 'x', 'video', 'Aula', 'pendente', 'https://exemplo/aula.mp4');

DO $$
BEGIN
  IF (SELECT agente FROM public.inteligencia_membros WHERE id = '10000000-0000-0000-0000-000000000177') <> 'ítalo' THEN
    RAISE EXCEPTION 'agente não veio do nome do funcionário'; END IF;
  IF (SELECT user_id FROM public.inteligencia_membros WHERE id = '10000000-0000-0000-0000-000000000177') <> auth.uid() THEN
    RAISE EXCEPTION 'dono não carimbado'; END IF;
  IF (SELECT caracteres FROM public.inteligencia_membros WHERE id = '10000000-0000-0000-0000-000000000177') <> 14 THEN
    RAISE EXCEPTION 'caracteres errado'; END IF;
  -- O que o Ítalo do projeto B enxerga: o geral do dono + o do projeto B (nada do A).
  IF (SELECT array_agg(nome ORDER BY nome) FROM public.inteligencia_membros
       WHERE user_id = auth.uid() AND agente = 'ítalo'
         AND (escopo = 'geral' OR cliente_id = '10000000-0000-0000-0000-000000000174')) <> ARRAY['Livro'] THEN
    RAISE EXCEPTION 'projeto B viu coisa do projeto A'; END IF;
END $$;

-- Funcionário de outro projeto é recusado.
DO $$
BEGIN
  INSERT INTO public.inteligencia_membros(cliente_id, membro_id, agente, tipo, nome)
  VALUES ('10000000-0000-0000-0000-000000000173', '10000000-0000-0000-0000-000000000176', 'x', 'texto', 'Errado');
  RAISE EXCEPTION 'aceitou funcionário de outro projeto';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'funcionário não é deste projeto' THEN RAISE; END IF;
END $$;

-- O app não lê o token.
DO $$
BEGIN
  PERFORM token FROM public.inteligencia_tokens LIMIT 1;
  RAISE EXCEPTION 'app leu o token';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- Storage: pasta do próprio projeto passa; pasta inválida não.
DO $$
BEGIN
  IF NOT public.inteligencia_pasta_permitida('10000000-0000-0000-0000-000000000173/m/livro.pdf', 'criar') THEN
    RAISE EXCEPTION 'dono recusado na pasta do projeto'; END IF;
  IF public.inteligencia_pasta_permitida('nao-e-uuid/livro.pdf', 'criar') THEN RAISE EXCEPTION 'pasta inválida aceita'; END IF;
END $$;
INSERT INTO storage.objects(bucket_id, name) VALUES ('inteligencia', '10000000-0000-0000-0000-000000000173/m/livro.pdf');

-- Outra pessoa não vê nem envia.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000172',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inteligencia_membros) THEN RAISE EXCEPTION 'alheio viu a inteligência'; END IF;
  IF public.inteligencia_pasta_permitida('10000000-0000-0000-0000-000000000173/m/x.pdf', 'criar') THEN
    RAISE EXCEPTION 'alheio pode enviar'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'inteligencia') THEN RAISE EXCEPTION 'alheio viu o arquivo'; END IF;
END $$;
RESET ROLE;

-- O Mac (chave pública) conclui o vídeo só com o token certo.
SET LOCAL ROLE anon;
DO $$
DECLARE v_token uuid;
BEGIN
  IF public.inteligencia_concluir('10000000-0000-0000-0000-000000000179', gen_random_uuid(), 'pronto', 'x') THEN
    RAISE EXCEPTION 'token errado aceito'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE v_token uuid;
BEGIN
  SELECT token INTO v_token FROM public.inteligencia_tokens WHERE item_id = '10000000-0000-0000-0000-000000000179';
  SET LOCAL ROLE anon;
  IF NOT public.inteligencia_concluir('10000000-0000-0000-0000-000000000179', v_token, 'pronto', 'transcrição da aula') THEN
    RAISE EXCEPTION 'token certo recusado'; END IF;
  -- Depois de pronto, não muda mais pelo token.
  IF public.inteligencia_concluir('10000000-0000-0000-0000-000000000179', v_token, 'erro', NULL, 'x') THEN
    RAISE EXCEPTION 'mudou item pronto'; END IF;
  RESET ROLE;
  IF (SELECT status || ':' || conteudo FROM public.inteligencia_membros WHERE id = '10000000-0000-0000-0000-000000000179')
     <> 'pronto:transcrição da aula' THEN RAISE EXCEPTION 'transcrição não gravou'; END IF;
END $$;
ROLLBACK;
