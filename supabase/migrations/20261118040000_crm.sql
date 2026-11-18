-- CRM por projeto (18/11/2026, Davi: "construir um CRM: quem começou a me seguir, quem abordei, vendi… de forma replicável").
-- Cada projeto (cliente) tem o seu: etapas do quadro (crm_etapas, as mesmas padrão para todos e editáveis), pessoas (crm_pessoas)
-- e a linha do tempo de cada uma (crm_eventos). A pessoa é única por projeto: telefone, e-mail ou @ do Instagram a reconhecem.
-- Entram sozinhos: lead do quiz, compra (Kiwify/Hotmart/Eduzz) e contato do Instagram; o resto o Davi cadastra no quadro.

CREATE TABLE public.crm_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 60),
  chave text,                                  -- novo | abordado | respondeu | proposta | vendido | pos_venda: as que os gatilhos automáticos usam
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_etapas_chave_idx ON public.crm_etapas (cliente_id, chave) WHERE chave IS NOT NULL;
CREATE INDEX crm_etapas_cliente_idx ON public.crm_etapas (cliente_id, ordem);

CREATE TABLE public.crm_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  nome text CHECK (nome IS NULL OR length(nome) <= 200),
  telefone text CHECK (telefone IS NULL OR length(telefone) <= 30),      -- só dígitos
  email text CHECK (email IS NULL OR length(email) <= 200),
  instagram text CHECK (instagram IS NULL OR length(instagram) <= 100),  -- sem @, minúsculo
  origem text NOT NULL DEFAULT 'manual',                                  -- manual | quiz | instagram | venda | whatsapp
  etapa_id uuid REFERENCES public.crm_etapas(id) ON DELETE SET NULL,
  valor_vendido numeric NOT NULL DEFAULT 0,
  notas text CHECK (notas IS NULL OR length(notas) <= 20000),
  quiz_resposta_id uuid REFERENCES public.quiz_respostas(id) ON DELETE SET NULL,
  ultima_interacao_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_pessoas_cliente_idx ON public.crm_pessoas (cliente_id, etapa_id);
CREATE INDEX crm_pessoas_tel_idx ON public.crm_pessoas (cliente_id, right(telefone, 10)) WHERE telefone IS NOT NULL;
CREATE INDEX crm_pessoas_email_idx ON public.crm_pessoas (cliente_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX crm_pessoas_ig_idx ON public.crm_pessoas (cliente_id, instagram) WHERE instagram IS NOT NULL;

CREATE TABLE public.crm_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.crm_pessoas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid,
  tipo text NOT NULL,                          -- entrou | etapa | quiz | abordagem | compra | reembolso | instagram | nota
  texto text CHECK (texto IS NULL OR length(texto) <= 5000),
  valor numeric,
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_eventos_pessoa_idx ON public.crm_eventos (pessoa_id, em DESC);

-- Permissões: o mesmo desenho das outras tabelas do projeto (dono + equipe com a área "conteudo").
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_etapas', 'crm_pessoas', 'crm_eventos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE TRIGGER team_stamp_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.team_stamp_owner()', t);
    EXECUTE format('CREATE POLICY team_grant_acessar ON public.%I FOR SELECT TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''acessar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''criar''))', t, t, t);
    EXECUTE format('CREATE POLICY team_grant_update ON public.%I FOR UPDATE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar'')) WITH CHECK (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''editar''))', t, t, t, t, t);
    EXECUTE format('CREATE POLICY team_grant_excluir ON public.%I FOR DELETE TO authenticated USING (public.team_row_allowed(%L, to_jsonb(%I.*), ''conteudo'', ''excluir''))', t, t, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, DELETE ON public.crm_etapas, public.crm_pessoas, public.crm_eventos TO authenticated;
GRANT UPDATE (nome, ordem) ON public.crm_etapas TO authenticated;
GRANT UPDATE (nome, telefone, email, instagram, etapa_id, notas, valor_vendido, ultima_interacao_em, atualizado_em) ON public.crm_pessoas TO authenticated;
-- a linha do tempo não se edita: só se acrescenta (notas incluídas)

-- Etapas padrão: todo projeto novo nasce com elas; os existentes recebem agora.
CREATE OR REPLACE FUNCTION public.crm_criar_etapas_padrao(p_cliente uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  INSERT INTO crm_etapas (cliente_id, user_id, nome, chave, ordem)
  SELECT c.id, c.user_id, e.nome, e.chave, e.ordem
    FROM clientes c,
         (VALUES ('Novo', 'novo', 1), ('Abordado', 'abordado', 2), ('Respondeu', 'respondeu', 3),
                 ('Proposta', 'proposta', 4), ('Vendido', 'vendido', 5), ('Pós-venda', 'pos_venda', 6)) AS e(nome, chave, ordem)
   WHERE c.id = p_cliente
  ON CONFLICT (cliente_id, chave) WHERE chave IS NOT NULL DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION public.crm_criar_etapas_padrao(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_etapas_novo_cliente() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN PERFORM crm_criar_etapas_padrao(NEW.id); RETURN NEW; END $function$;
CREATE TRIGGER crm_etapas_novo_cliente AFTER INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.crm_etapas_novo_cliente();
SELECT public.crm_criar_etapas_padrao(id) FROM public.clientes;

-- Acha (ou cria) a pessoa do projeto pelo telefone, e-mail ou @, completa o que faltava e anota o evento.
-- p_etapa: chave da etapa em que ela entra se for nova; p_subir: só avança de etapa (nunca volta uma que o Davi moveu para frente).
CREATE OR REPLACE FUNCTION public.crm_registrar(p_cliente uuid, p_nome text, p_telefone text, p_email text, p_instagram text,
                                                 p_origem text, p_etapa text, p_evento text, p_texto text, p_valor numeric DEFAULT NULL, p_quando timestamptz DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  mail text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  ig text := nullif(lower(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', '')), '');
  pid uuid; dono uuid; et uuid; et_ord int; atual_ord int; atual uuid; criada boolean := false;
BEGIN
  IF tel IS NOT NULL AND length(tel) < 10 THEN tel := NULL; END IF;
  IF tel IS NULL AND mail IS NULL AND ig IS NULL THEN RETURN NULL; END IF;
  SELECT user_id INTO dono FROM clientes WHERE id = p_cliente;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM crm_criar_etapas_padrao(p_cliente);
  SELECT p.id INTO pid FROM crm_pessoas p WHERE p.cliente_id = p_cliente
     AND ((tel IS NOT NULL AND right(p.telefone, 10) = right(tel, 10)) OR (mail IS NOT NULL AND lower(p.email) = mail) OR (ig IS NOT NULL AND p.instagram = ig))
   ORDER BY p.criado_em LIMIT 1;
  SELECT id, ordem INTO et, et_ord FROM crm_etapas WHERE cliente_id = p_cliente AND chave = p_etapa;
  IF pid IS NULL THEN
    INSERT INTO crm_pessoas (cliente_id, user_id, nome, telefone, email, instagram, origem, etapa_id, ultima_interacao_em, criado_em)
    VALUES (p_cliente, dono, nullif(btrim(coalesce(p_nome, '')), ''), tel, mail, ig, p_origem, et, p_quando, p_quando) RETURNING id INTO pid;
    INSERT INTO crm_eventos (pessoa_id, cliente_id, user_id, tipo, texto, em) VALUES (pid, p_cliente, dono, 'entrou', 'Entrou pelo ' || p_origem, p_quando);
    criada := true;
  ELSE
    SELECT p.etapa_id, coalesce(e.ordem, 0) INTO atual, atual_ord FROM crm_pessoas p LEFT JOIN crm_etapas e ON e.id = p.etapa_id WHERE p.id = pid;
    UPDATE crm_pessoas SET nome = coalesce(nome, nullif(btrim(coalesce(p_nome, '')), '')), telefone = coalesce(telefone, tel), email = coalesce(email, mail),
           instagram = coalesce(instagram, ig), ultima_interacao_em = greatest(ultima_interacao_em, p_quando), atualizado_em = now(),
           etapa_id = CASE WHEN et IS NOT NULL AND (atual IS NULL OR et_ord > atual_ord) THEN et ELSE etapa_id END
     WHERE id = pid;
    IF et IS NOT NULL AND (atual IS NULL OR et_ord > atual_ord) THEN
      INSERT INTO crm_eventos (pessoa_id, cliente_id, user_id, tipo, texto, em) VALUES (pid, p_cliente, dono, 'etapa', 'Foi para ' || (SELECT nome FROM crm_etapas WHERE id = et), p_quando);
    END IF;
  END IF;
  IF p_evento IS NOT NULL AND NOT (criada AND p_evento = 'entrou') THEN
    INSERT INTO crm_eventos (pessoa_id, cliente_id, user_id, tipo, texto, valor, em) VALUES (pid, p_cliente, dono, p_evento, p_texto, p_valor, p_quando);
  END IF;
  RETURN pid;
END $function$;
REVOKE ALL ON FUNCTION public.crm_registrar(uuid, text, text, text, text, text, text, text, text, numeric, timestamptz) FROM PUBLIC, anon, authenticated;

-- Quiz: toda resposta com contato vira pessoa; ir para "em contato" leva para Abordado.
CREATE OR REPLACE FUNCTION public.crm_do_quiz() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    pid := crm_registrar(NEW.cliente_id, NEW.nome, NEW.whatsapp, NEW.email, NEW.instagram, 'quiz', 'novo', 'quiz',
                         'Respondeu o quiz' || coalesce(' (perfil ' || NEW.perfil || ')', ''), NULL, NEW.criada_em);
    IF pid IS NOT NULL THEN UPDATE crm_pessoas SET quiz_resposta_id = NEW.id WHERE id = pid AND quiz_resposta_id IS NULL; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('em_contato', 'convertido') THEN
    PERFORM crm_registrar(NEW.cliente_id, NEW.nome, NEW.whatsapp, NEW.email, NEW.instagram, 'quiz',
                          CASE WHEN NEW.status = 'convertido' THEN 'vendido' ELSE 'abordado' END, NULL, NULL);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;   -- o CRM nunca atrapalha o quiz
END $function$;
CREATE TRIGGER crm_do_quiz AFTER INSERT OR UPDATE OF status ON public.quiz_respostas FOR EACH ROW EXECUTE FUNCTION public.crm_do_quiz();

CREATE OR REPLACE FUNCTION public.crm_da_abordagem() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r quiz_respostas;
BEGIN
  SELECT * INTO r FROM quiz_respostas WHERE id = NEW.resposta_id;
  IF FOUND THEN PERFORM crm_registrar(r.cliente_id, r.nome, r.whatsapp, r.email, r.instagram, 'quiz', 'abordado', 'abordagem', 'Abordado por ' || NEW.canal, NULL, NEW.enviada_em); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_da_abordagem AFTER INSERT ON public.quiz_abordagens FOR EACH ROW EXECUTE FUNCTION public.crm_da_abordagem();

-- Compra e reembolso (webhook da plataforma): o comprador vai para Vendido e soma o valor.
CREATE OR REPLACE FUNCTION public.crm_da_venda() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cid uuid; pid uuid;
BEGIN
  IF NEW.tipo NOT IN ('venda', 'reembolso') THEN RETURN NEW; END IF;
  SELECT cliente_id INTO cid FROM produtos_cliente WHERE id = NEW.produto_id;
  IF cid IS NULL THEN RETURN NEW; END IF;
  pid := crm_registrar(cid, NEW.comprador_nome, NULL, NEW.comprador_email, NULL, 'venda',
                       CASE WHEN NEW.tipo = 'venda' THEN 'vendido' ELSE NULL END,
                       CASE WHEN NEW.tipo = 'venda' THEN 'compra' ELSE 'reembolso' END,
                       coalesce(NEW.produto_plataforma, 'Produto') || ' (' || NEW.plataforma || ')', NEW.valor, NEW.recebido_em);
  IF pid IS NOT NULL THEN
    UPDATE crm_pessoas SET valor_vendido = greatest(0, valor_vendido + CASE WHEN NEW.tipo = 'venda' THEN NEW.valor ELSE -NEW.valor END) WHERE id = pid;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_da_venda AFTER INSERT ON public.vendas_plataforma_eventos FOR EACH ROW EXECUTE FUNCTION public.crm_da_venda();

-- Instagram: quem mandou DM ou interagiu entra pelo @ (precisa do username).
CREATE OR REPLACE FUNCTION public.crm_do_instagram() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cid uuid;
BEGIN
  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN RETURN NEW; END IF;
  SELECT cliente_id INTO cid FROM instagram_conexoes WHERE ig_user_id = NEW.ig_user_id AND cliente_id IS NOT NULL LIMIT 1;
  IF cid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.username IS NOT DISTINCT FROM NEW.username THEN RETURN NEW; END IF;
  PERFORM crm_registrar(cid, NEW.nome, NULL, NULL, NEW.username, 'instagram', 'novo', 'instagram', 'Conversou no Instagram', NULL, NEW.atualizado_em);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
CREATE TRIGGER crm_do_instagram AFTER INSERT OR UPDATE OF username ON public.instagram_contatos FOR EACH ROW EXECUTE FUNCTION public.crm_do_instagram();

-- Traz o que já existe (uma vez).
SELECT public.crm_registrar(r.cliente_id, r.nome, r.whatsapp, r.email, r.instagram, 'quiz',
         CASE r.status WHEN 'convertido' THEN 'vendido' WHEN 'em_contato' THEN 'abordado' ELSE 'novo' END,
         'quiz', 'Respondeu o quiz' || coalesce(' (perfil ' || r.perfil || ')', ''), NULL, r.criada_em)
  FROM public.quiz_respostas r ORDER BY r.criada_em;
UPDATE public.crm_pessoas p SET quiz_resposta_id = r.id
  FROM public.quiz_respostas r WHERE r.cliente_id = p.cliente_id AND p.quiz_resposta_id IS NULL
   AND ((r.whatsapp IS NOT NULL AND right(regexp_replace(r.whatsapp, '\D', '', 'g'), 10) = right(p.telefone, 10)) OR (r.email IS NOT NULL AND lower(r.email) = p.email));
SELECT public.crm_registrar(i.cliente_id, c.nome, NULL, NULL, c.username, 'instagram', 'novo', 'instagram', 'Conversou no Instagram', NULL, c.atualizado_em)
  FROM public.instagram_contatos c JOIN public.instagram_conexoes i ON i.ig_user_id = c.ig_user_id AND i.cliente_id IS NOT NULL
 WHERE c.username IS NOT NULL;
SELECT public.crm_registrar(pc.cliente_id, v.comprador_nome, NULL, v.comprador_email, NULL, 'venda', 'vendido', 'compra',
         coalesce(v.produto_plataforma, 'Produto') || ' (' || v.plataforma || ')', v.valor, v.recebido_em)
  FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente pc ON pc.id = v.produto_id
 WHERE v.tipo = 'venda' AND v.comprador_email IS NOT NULL ORDER BY v.recebido_em;
UPDATE public.crm_pessoas p SET valor_vendido = s.total
  FROM (SELECT pc.cliente_id, lower(v.comprador_email) AS mail,
               sum(CASE WHEN v.tipo = 'venda' THEN v.valor ELSE -v.valor END) AS total
          FROM public.vendas_plataforma_eventos v JOIN public.produtos_cliente pc ON pc.id = v.produto_id
         WHERE v.tipo IN ('venda', 'reembolso') AND v.comprador_email IS NOT NULL GROUP BY 1, 2) s
 WHERE s.cliente_id = p.cliente_id AND s.mail = lower(p.email);

NOTIFY pgrst, 'reload schema';
