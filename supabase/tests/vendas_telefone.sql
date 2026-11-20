-- Venda ligada ao lead pelo telefone (20/11/2026): a chave ignora +55, DDD, nono dígito e formatação.
BEGIN;
DO $$
BEGIN
  IF public.fone_chave('+55 (11) 98765-4321') <> public.fone_chave('11 8765-4321') THEN RAISE EXCEPTION 'fone_chave: o mesmo número com e sem +55/nono dígito deveria bater'; END IF;
  IF public.fone_chave('(11) 98765-4321') = public.fone_chave('(11) 98765-1234') THEN RAISE EXCEPTION 'fone_chave: números diferentes não podem bater'; END IF;
  IF public.fone_chave('1234') IS NOT NULL OR public.fone_chave(NULL) IS NOT NULL THEN RAISE EXCEPTION 'fone_chave: número curto ou vazio não vira chave'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendas_plataforma_eventos WHERE plataforma = 'eduzz' AND tipo = 'venda' AND payload #>> '{data,buyer,cellphone}' IS NOT NULL AND comprador_telefone IS NULL) THEN
    RAISE EXCEPTION 'venda da Eduzz com celular no payload ficou sem comprador_telefone';
  END IF;
END $$;
ROLLBACK;
