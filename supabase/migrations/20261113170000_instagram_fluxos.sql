-- Fluxos de mensagem do Instagram (13/11/2026, Davi: "criar um fluxo de mensagem, igual o dash do ManyChat; as novas opções são para todas as contas").
-- Um fluxo é um grafo de blocos (mensagem com botões, esperar, condição, fim) ligado a uma conta do Instagram e a uma palavra-chave.
-- O robô (edge `instagram-automacoes`) começa o fluxo quando a palavra chega e anda pelos blocos: cada pessoa tem a sua execução.
-- ATENÇÃO: sem FK com ON DELETE CASCADE para a conexão (13/11 uma conexão apagada levou as automações junto): o fluxo só some se for apagado de propósito.
CREATE TABLE public.instagram_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ig_user_id text NOT NULL,
  nome text NOT NULL CHECK (btrim(nome) <> '' AND length(nome) <= 120),
  ativo boolean NOT NULL DEFAULT false,
  gatilhos text[] NOT NULL DEFAULT ARRAY['comentario'] CHECK (gatilhos <@ ARRAY['comentario', 'dm', 'story']),
  palavras_chave text[] NOT NULL DEFAULT '{}',
  correspondencia text NOT NULL DEFAULT 'contem' CHECK (correspondencia IN ('contem', 'exata')),
  media_ids text[],
  respostas_comentario text[] NOT NULL DEFAULT '{}',
  grafo jsonb NOT NULL DEFAULT '{"nos":[{"id":"inicio","tipo":"inicio","x":0,"y":0,"dados":{}}],"ligacoes":[]}'::jsonb
    CHECK (jsonb_typeof(grafo->'nos') = 'array' AND jsonb_typeof(grafo->'ligacoes') = 'array' AND length(grafo::text) < 400000),
  disparos integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_fluxos_conta_idx ON public.instagram_fluxos (ig_user_id, ativo);
ALTER TABLE public.instagram_fluxos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_fluxos FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.instagram_fluxos TO authenticated;
GRANT UPDATE (nome, ativo, gatilhos, palavras_chave, correspondencia, media_ids, respostas_comentario, grafo, atualizado_em) ON public.instagram_fluxos TO authenticated;   -- disparos: só o robô

-- Dono do fluxo = dono da conta conectada (mesma regra das automações).
CREATE FUNCTION public.instagram_fluxo_dono() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dono uuid;
BEGIN
  SELECT user_id INTO dono FROM public.instagram_conexoes WHERE ig_user_id = NEW.ig_user_id;
  IF dono IS NOT NULL THEN NEW.user_id := dono; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER instagram_fluxo_dono BEFORE INSERT OR UPDATE OF ig_user_id ON public.instagram_fluxos FOR EACH ROW EXECUTE FUNCTION public.instagram_fluxo_dono();

CREATE POLICY equipe_le ON public.instagram_fluxos FOR SELECT TO authenticated USING (public.instagram_conta_permite(ig_user_id, 'acessar'));
CREATE POLICY equipe_cria ON public.instagram_fluxos FOR INSERT TO authenticated WITH CHECK (public.instagram_conta_permite(ig_user_id, 'criar'));
CREATE POLICY equipe_edita ON public.instagram_fluxos FOR UPDATE TO authenticated
  USING (public.instagram_conta_permite(ig_user_id, 'editar')) WITH CHECK (public.instagram_conta_permite(ig_user_id, 'editar'));
CREATE POLICY equipe_apaga ON public.instagram_fluxos FOR DELETE TO authenticated USING (public.instagram_conta_permite(ig_user_id, 'editar'));

-- Execução = a caminhada de UMA pessoa por um fluxo.
CREATE TABLE public.instagram_fluxo_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.instagram_fluxos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ig_user_id text NOT NULL,
  contato_id text NOT NULL,
  contato_username text,
  no_atual text,                 -- bloco onde parou (esperando resposta ou tempo)
  estado text NOT NULL DEFAULT 'rodando' CHECK (estado IN ('rodando', 'aguardando_resposta', 'aguardando_tempo', 'fim', 'erro')),
  proximo_em timestamptz,        -- quando o robô retoma (espera de tempo)
  janela_ate timestamptz,        -- fim da janela de 24 h da Meta (a pessoa precisa ter falado)
  comment_id text,               -- primeira mensagem de um comentário vai como resposta privada
  respondeu boolean NOT NULL DEFAULT false,
  ultimo_texto text NOT NULL DEFAULT '',
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{no, tipo, em}] para os números de cada bloco
  erro text,
  trava_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instagram_fluxo_execucao_ativa_uq ON public.instagram_fluxo_execucoes (fluxo_id, contato_id) WHERE estado IN ('rodando', 'aguardando_resposta', 'aguardando_tempo');
CREATE INDEX instagram_fluxo_execucao_contato_idx ON public.instagram_fluxo_execucoes (ig_user_id, contato_id, estado);
CREATE INDEX instagram_fluxo_execucao_tempo_idx ON public.instagram_fluxo_execucoes (proximo_em) WHERE estado = 'aguardando_tempo';
ALTER TABLE public.instagram_fluxo_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_fluxo_execucoes FROM anon, authenticated;
GRANT SELECT ON public.instagram_fluxo_execucoes TO authenticated;   -- o app só lê (números dos blocos); quem escreve é o robô
CREATE POLICY equipe_le ON public.instagram_fluxo_execucoes FOR SELECT TO authenticated USING (public.instagram_conta_permite(ig_user_id, 'acessar'));

-- Fila do robô para retomar as esperas vencidas: uma por vez, com trava.
CREATE FUNCTION public.fluxo_proximas_execucoes(p_limite integer DEFAULT 10) RETURNS SETOF public.instagram_fluxo_execucoes
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.instagram_fluxo_execucoes e SET trava_ate = now() + interval '3 minutes'
  WHERE e.id IN (
    SELECT id FROM public.instagram_fluxo_execucoes
    WHERE estado = 'aguardando_tempo' AND proximo_em <= now() AND (trava_ate IS NULL OR trava_ate < now())
    ORDER BY proximo_em LIMIT p_limite FOR UPDATE SKIP LOCKED)
  RETURNING e.*;
$$;
REVOKE ALL ON FUNCTION public.fluxo_proximas_execucoes(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxo_proximas_execucoes(integer) TO service_role;

-- A cada minuto o pg_cron chama o robô para retomar as esperas (mesma chave do Vault da Dalila).
SELECT cron.schedule('instagram-fluxos-tick', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://ucjyobemrxqfcoopkcgb.supabase.co/functions/v1/instagram-automacoes/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dalila-chave',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dalila_publicar')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);
NOTIFY pgrst, 'reload schema';
