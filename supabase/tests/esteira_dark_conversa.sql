-- Regressão: o dono conversa para montar o estilo do perfil; pedido nasce pendente e sem resposta; autor não se forja; só em perfil seu; outra pessoa não vê.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000421','ec-dono@example.com',now()), ('10000000-0000-0000-0000-000000000422','ec-outro@example.com',now());
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000421',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.esteira_dark_perfis(id, nome) VALUES ('10000000-0000-0000-0000-000000000423', 'Perfil Conversa');
INSERT INTO public.esteira_dark_pedidos(perfil_id, mensagem, autor_id) VALUES ('10000000-0000-0000-0000-000000000423', 'quero um vídeo sombrio', '10000000-0000-0000-0000-0000000000ff');
DO $$
BEGIN
  IF (SELECT autor_id FROM public.esteira_dark_pedidos) <> '10000000-0000-0000-0000-000000000421' THEN RAISE EXCEPTION 'autor forjado'; END IF;
  UPDATE public.esteira_dark_perfis SET conversa_zerada_em = now();
  BEGIN UPDATE public.esteira_dark_perfis SET sessao_conversa = 'x'; RAISE EXCEPTION 'dono mexeu na sessão';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.esteira_dark_pedidos(perfil_id, mensagem, status, resposta) VALUES ('10000000-0000-0000-0000-000000000423', 'oi', 'respondido', 'falsa'); RAISE EXCEPTION 'aceitou pedido já respondido';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.esteira_dark_pedidos SET status = 'respondido'; RAISE EXCEPTION 'dono respondeu o próprio pedido';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000422',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.esteira_dark_pedidos) <> 0 THEN RAISE EXCEPTION 'outra pessoa viu a conversa'; END IF;
  BEGIN INSERT INTO public.esteira_dark_pedidos(perfil_id, mensagem) VALUES ('10000000-0000-0000-0000-000000000423', 'invasão'); RAISE EXCEPTION 'pedido em perfil alheio';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $$;
RESET ROLE;
-- Modo vivo: só o Davi liga (a conta de teste não é o Davi); o dono comum não consegue.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000421',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN UPDATE public.esteira_dark_perfis SET modo_vivo = true; RAISE EXCEPTION 'não-Davi ligou o modo vivo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'só o Davi liga o modo vivo' THEN RAISE; END IF; END;
  BEGIN UPDATE public.esteira_dark_perfis SET sessao_vivo = 'x'; RAISE EXCEPTION 'mexeu na sessão viva';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
