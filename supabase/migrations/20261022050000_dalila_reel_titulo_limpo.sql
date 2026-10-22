-- Instalivros (22/10/2026): o @instalivrosapp foi conectado hoje e o reel pronto
-- "Bruto 01-4-livros-perigosos-para-manipular" ficou parado esperando o Davi.
-- 1. Título limpo: o nome do arquivo ("Bruto 01-4-livros-…") vira "4 livros …".
-- 2. Projeto que conecta o Instagram: a Dalila programa sozinha o que estava
--    esperando "Escolher data" (reel pronto / carrossel aprovado), no 1º dia livre.
-- 3. Só hoje: limpa os títulos que já existem e devolve para a fila do Mac os
--    reels do Instalivros que deram erro porque o Claude bateu no limite.

CREATE FUNCTION public.reel_titulo_limpo(p_titulo text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE v text;
BEGIN
  v := trim(regexp_replace(regexp_replace(coalesce(p_titulo, ''), '^\s*Piloto\s*[—–-]\s*', ''), '\s*\(IMG_[0-9]+\)\s*$', ''));
  -- "Bruto 01-4-livros-perigosos" (nome do arquivo do bruto): sai o "Bruto 01-"
  -- e os hífens viram espaço. "Bruto IMG_2030" não tem número e continua genérico.
  IF v ~* '^bruto\s*[0-9]+\s*[-_.]\s*\S' THEN
    v := regexp_replace(v, '^bruto\s*[0-9]+\s*[-_.]\s*', '', 'i');
    IF v !~ '\s' THEN v := trim(regexp_replace(v, '[-_]+', ' ', 'g')); END IF;
    v := upper(left(v, 1)) || substr(v, 2);
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.reel_da_edicao(p_edicao uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  e public.edicoes_video;
  v_dono uuid;
  v_titulo text;
  v_dalila public.membros;
  v_reel uuid;
BEGIN
  SELECT * INTO e FROM public.edicoes_video WHERE id = p_edicao;
  IF e.id IS NULL OR e.status <> 'aprovado' THEN RETURN NULL; END IF;
  SELECT id INTO v_reel FROM public.reels WHERE edicao_id = e.id;
  IF v_reel IS NOT NULL THEN RETURN v_reel; END IF;
  v_dono := coalesce(e.user_id, (SELECT user_id FROM public.clientes WHERE id = e.cliente_id));
  -- O título da edição vale (é o que o vídeo fala); o do card só quando o da
  -- edição é genérico ("Bruto IMG_2030").
  v_titulo := public.reel_titulo_limpo(e.titulo);
  IF v_titulo = '' OR v_titulo ~* '^bruto\M' THEN
    v_titulo := coalesce(nullif(trim((SELECT titulo FROM public.videos_vertical WHERE id = e.video_vertical_id)), ''), e.titulo);
  END IF;
  INSERT INTO public.reels (cliente_id, user_id, edicao_id, video_vertical_id, titulo, final_drive, duracao)
  VALUES (e.cliente_id, v_dono, e.id, e.video_vertical_id, v_titulo, e.final_drive, e.duracao)
  RETURNING id INTO v_reel;

  SELECT * INTO v_dalila FROM public.membros
    WHERE cliente_id = e.cliente_id AND ativo AND (lower(nome) = 'dalila' OR funcao ILIKE '%social%')
    ORDER BY (lower(nome) = 'dalila') DESC LIMIT 1;
  IF v_dalila.id IS NOT NULL THEN
    UPDATE public.reels SET atividade_id = public.dalila_tarefa(e.cliente_id, v_dono, v_dalila,
      'Programar reel: ' || v_titulo, 'programacao', 'media',
      'Edição do Danilo aprovada pelo Davi. A Dalila prepara o vídeo e a legenda; publica no dia e hora que o Davi escolher.', NULL)
    WHERE id = v_reel;
  END IF;
  RETURN v_reel;
END;
$$;
REVOKE ALL ON FUNCTION public.reel_da_edicao(uuid) FROM public, anon, authenticated;

-- 2. O que esperava "Escolher data" no projeto passa para a Dalila (mesma conta
-- da migração 20261017030000, agora por projeto e chamada ao conectar o Instagram).
CREATE FUNCTION public.dalila_programar_pendentes(p_cliente uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN SELECT re.id, re.tarefa_data_id FROM public.reels re
            JOIN public.atividades a ON a.id = re.tarefa_data_id
           WHERE re.cliente_id = p_cliente AND re.status = 'pronto' AND re.programado_para IS NULL
             AND NOT a.concluida AND a.deleted_at IS NULL
           ORDER BY re.criado_em
  LOOP
    UPDATE public.reels SET tarefa_data_id = NULL WHERE id = r.id;
    IF public.dalila_programar_reel_sozinha(r.id) THEN
      UPDATE public.atividades SET deleted_at = now() WHERE id = r.tarefa_data_id;
      v_n := v_n + 1;
    ELSE
      UPDATE public.reels SET tarefa_data_id = r.tarefa_data_id WHERE id = r.id;   -- não deu: continua com o Davi
    END IF;
  END LOOP;
  FOR r IN SELECT c.id, c.tarefa_data_id FROM public.carrosseis c
            JOIN public.atividades a ON a.id = c.tarefa_data_id
           WHERE c.cliente_id = p_cliente AND c.status = 'aprovado' AND c.programado_para IS NULL
             AND NOT a.concluida AND a.deleted_at IS NULL
           ORDER BY c.numero
  LOOP
    UPDATE public.carrosseis SET tarefa_data_id = NULL WHERE id = r.id;
    IF public.dalila_programar_carrossel_sozinha(r.id) THEN
      UPDATE public.atividades SET deleted_at = now() WHERE id = r.tarefa_data_id;
      v_n := v_n + 1;
    ELSE
      UPDATE public.carrosseis SET tarefa_data_id = r.tarefa_data_id WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.dalila_programar_pendentes(uuid) FROM public, anon, authenticated;

CREATE FUNCTION public.instagram_conectado_programar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.dalila_programar_pendentes(NEW.cliente_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER instagram_conectado_programar AFTER INSERT OR UPDATE OF cliente_id ON public.instagram_conexoes
  FOR EACH ROW WHEN (NEW.cliente_id IS NOT NULL) EXECUTE FUNCTION public.instagram_conectado_programar();

-- 3a. Títulos que já existem (ainda não publicados), e as tarefas com o nome antigo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, titulo, public.reel_titulo_limpo(titulo) AS novo, atividade_id, tarefa_data_id
             FROM public.reels
            WHERE status <> 'publicado' AND titulo ~* '^\s*bruto\s*[0-9]+\s*[-_.]\s*\S'
  LOOP
    UPDATE public.reels SET titulo = r.novo, atualizado_em = now() WHERE id = r.id;
    UPDATE public.atividades SET titulo = replace(titulo, r.titulo, r.novo)
     WHERE id IN (r.atividade_id, r.tarefa_data_id) AND position(r.titulo IN titulo) > 0;
  END LOOP;
END $$;

-- 3b. Instalivros: "o Claude não devolveu a legenda" (limite da sessão, já liberado)
-- volta para o Mac preparar; pronto, a Dalila programa sozinha às 18h.
UPDATE public.reels SET status = 'preparando', preparo_tentativas = 0,
  mensagem = 'De volta para a Dalila preparar (o limite do Claude já liberou)', atualizado_em = now()
WHERE cliente_id = 'e354f4be-8a8d-4c34-8f47-f85e5981b8d3' AND status = 'erro'
  AND video_url IS NULL AND token_envio IS NOT NULL AND mensagem LIKE '%session limit%';

-- 3c. Instalivros já está conectado: o que ainda espera data entra agora.
SELECT public.dalila_programar_pendentes('e354f4be-8a8d-4c34-8f47-f85e5981b8d3');

NOTIFY pgrst, 'reload schema';
