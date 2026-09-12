-- Regressão: compartilhar documento avulso, compartilhar pasta inteira,
-- estranho sem aceitar não vê nada, aceitar libera, revogar tira de novo.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-000000000095','share-owner-test@example.com',now()),
 ('10000000-0000-0000-0000-000000000094','share-guest-test@example.com',now());

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000095',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_doc_solo uuid; v_doc_outro uuid; v_pasta uuid; v_doc_a uuid; v_doc_b uuid;
        v_share_doc uuid; v_share_pasta uuid; v_token_doc text; v_token_pasta text;
BEGIN
  INSERT INTO public.documentos(titulo) VALUES ('Documento solo compartilhado') RETURNING id INTO v_doc_solo;
  INSERT INTO public.documentos(titulo) VALUES ('Documento privado, não compartilhado') RETURNING id INTO v_doc_outro;

  INSERT INTO public.pastas_atividade(nome) VALUES ('Pasta compartilhada') RETURNING id INTO v_pasta;
  INSERT INTO public.documentos(titulo, pasta_id) VALUES ('Guia A', v_pasta) RETURNING id INTO v_doc_a;
  INSERT INTO public.documentos(titulo, pasta_id) VALUES ('Guia B', v_pasta) RETURNING id INTO v_doc_b;

  INSERT INTO public.compartilhamentos(tipo, documento_id) VALUES ('documento', v_doc_solo)
    RETURNING id, token INTO v_share_doc, v_token_doc;
  INSERT INTO public.compartilhamentos(tipo, pasta_id) VALUES ('pasta', v_pasta)
    RETURNING id, token INTO v_share_pasta, v_token_pasta;

  IF v_token_doc IS NULL OR v_token_pasta IS NULL THEN
    RAISE EXCEPTION 'Token do compartilhamento não foi gerado';
  END IF;

  PERFORM set_config('app.token_doc', v_token_doc, false);
  PERFORM set_config('app.token_pasta', v_token_pasta, false);
  PERFORM set_config('app.doc_solo', v_doc_solo::text, false);
  PERFORM set_config('app.doc_outro', v_doc_outro::text, false);
  PERFORM set_config('app.doc_a', v_doc_a::text, false);
  PERFORM set_config('app.doc_b', v_doc_b::text, false);
  PERFORM set_config('app.share_doc', v_share_doc::text, false);
  PERFORM set_config('app.share_pasta', v_share_pasta::text, false);
END $$;

-- Metadados públicos: dá pra ler o título antes de logar, token errado não vaza nada.
DO $$
BEGIN
  IF (public.compartilhamento_publico(current_setting('app.token_doc'))->>'titulo') <> 'Documento solo compartilhado' THEN
    RAISE EXCEPTION 'Metadados públicos não trouxeram o título certo';
  END IF;
  IF (public.compartilhamento_publico('token-que-nao-existe')->>'valido') <> 'false' THEN
    RAISE EXCEPTION 'Token inexistente deveria voltar valido=false';
  END IF;
END $$;

-- Troca para o convidado: antes de aceitar, não enxerga nada.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000094',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_solo')::uuid) THEN
    RAISE EXCEPTION 'Convidado viu documento antes de aceitar o link';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_a')::uuid) THEN
    RAISE EXCEPTION 'Convidado viu guia da pasta antes de aceitar o link';
  END IF;
END $$;

-- Aceitar com token inválido falha.
DO $$
BEGIN
  BEGIN
    PERFORM public.aceitar_compartilhamento('token-invalido-123');
    RAISE EXCEPTION 'Aceitou um token que não existe';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Link de compartilhamento inválido' THEN RAISE; END IF;
  END;
END $$;

-- Aceita o documento avulso: passa a ver só ele, não o outro documento privado do dono.
SELECT public.aceitar_compartilhamento(current_setting('app.token_doc'));
DO $$
DECLARE changed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_solo')::uuid) THEN
    RAISE EXCEPTION 'Convidado não viu o documento depois de aceitar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_outro')::uuid) THEN
    RAISE EXCEPTION 'Convidado enxergou documento privado não compartilhado';
  END IF;
  UPDATE public.documentos SET conteudo = 'editado pelo convidado' WHERE id = current_setting('app.doc_solo')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Convidado não conseguiu editar o documento compartilhado'; END IF;
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_a')::uuid) THEN
    RAISE EXCEPTION 'Aceitar o link do documento avulso vazou acesso à pasta';
  END IF;
END $$;

-- Aceita a pasta inteira: passa a ver as duas guias.
SELECT public.aceitar_compartilhamento(current_setting('app.token_pasta'));
DO $$
BEGIN
  IF (SELECT count(*) FROM public.documentos WHERE pasta_id = current_setting('app.doc_a')::uuid IS NOT NULL AND id IN (current_setting('app.doc_a')::uuid, current_setting('app.doc_b')::uuid)) <> 2 THEN
    RAISE EXCEPTION 'Convidado não viu as duas guias da pasta compartilhada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_outro')::uuid) THEN
    RAISE EXCEPTION 'Compartilhar a pasta vazou acesso a documento de fora dela';
  END IF;
END $$;

-- Dono revoga o compartilhamento do documento avulso; convidado perde o acesso.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000095',true);
DELETE FROM public.compartilhamentos WHERE id = current_setting('app.share_doc')::uuid;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000094',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_solo')::uuid) THEN
    RAISE EXCEPTION 'Convidado ainda via o documento depois do dono revogar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.documentos WHERE id = current_setting('app.doc_a')::uuid) THEN
    RAISE EXCEPTION 'Revogar o compartilhamento do documento afetou o da pasta';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
