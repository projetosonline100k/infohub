-- Tarefa criada sem responsável ficava com responsavel_id e responsavel_nome
-- vazios e sumia do filtro "Só eu" (ex.: "Montar quiz do Instalivros"). Agora,
-- ao criar sem ninguém escolhido, quem criou vira o responsável, se for pessoa
-- cadastrada no projeto (membros.conta_id = auth.uid()). Vale para todos os
-- pontos de criação (Kanban, Semana, Atlas, mapa mental, editor de vídeo).
-- Inserts sem usuário logado (service role: Roy, Danilo, ponte) não mudam.
CREATE OR REPLACE FUNCTION public.atividade_liga_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_primeiro text;
  v_membro public.membros%ROWTYPE;
BEGIN
  IF NEW.cliente_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.responsavel_id IS NULL AND btrim(coalesce(NEW.responsavel_nome, '')) = '' AND auth.uid() IS NOT NULL THEN
    -- Ninguém escolhido: fica com quem criou.
    SELECT id INTO NEW.responsavel_id FROM membros
     WHERE cliente_id = NEW.cliente_id AND conta_id = auth.uid() AND ativo AND NOT eh_ia
     ORDER BY ordem
     LIMIT 1;
  END IF;
  IF NEW.responsavel_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN
    -- Escolheu a pessoa: o nome acompanha (telas antigas leem o texto).
    SELECT * INTO v_membro FROM membros WHERE id = NEW.responsavel_id AND cliente_id = NEW.cliente_id;
    IF NOT FOUND THEN NEW.responsavel_id := NULL; RETURN NEW; END IF;
    IF NEW.responsavel_nome IS NULL OR NOT (NEW.responsavel_nome ILIKE '%' || v_membro.nome || '%') THEN
      NEW.responsavel_nome := v_membro.nome;
    END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.responsavel_nome IS DISTINCT FROM OLD.responsavel_nome THEN
    -- Escreveu o nome: acha a pessoa pelo primeiro responsável da lista.
    v_primeiro := lower(btrim(split_part(coalesce(NEW.responsavel_nome, ''), ',', 1)));
    IF v_primeiro = '' THEN
      NEW.responsavel_id := NULL;
    ELSE
      SELECT * INTO v_membro FROM membros
       WHERE cliente_id = NEW.cliente_id AND ativo
         AND (lower(nome) = v_primeiro OR split_part(lower(nome), ' ', 1) = split_part(v_primeiro, ' ', 1))
       ORDER BY (lower(nome) = v_primeiro) DESC, ordem
       LIMIT 1;
      NEW.responsavel_id := CASE WHEN FOUND THEN v_membro.id END;
    END IF;
  END IF;
  IF NEW.responsavel_id IS NOT NULL AND NEW.setor_id IS NULL THEN
    SELECT setor_id INTO NEW.setor_id FROM membros WHERE id = NEW.responsavel_id;
  END IF;
  RETURN NEW;
END;
$$;
