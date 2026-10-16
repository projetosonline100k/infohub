-- Regra pedida pelo Davi (15/10/2026): a Dalila nunca publica no perfil errado.
-- Um carrossel só pode ser programado se o PROJETO dele tiver o próprio
-- Instagram conectado. A conexão geral da conta (sem projeto, o @eu.davi…) vale
-- só pro projeto Davi Queiroz. Vale por qualquer caminho (tela, RPC, scripts).
CREATE OR REPLACE FUNCTION public.carrossel_confere_instagram()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('programado', 'publicando') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (SELECT 1 FROM instagram_conexoes WHERE cliente_id = NEW.cliente_id)
       AND NOT (NEW.cliente_id = 'e4b24f93-0eda-43fc-b50e-3ebe24f8905f'
                AND EXISTS (SELECT 1 FROM instagram_conexoes ic JOIN clientes c ON c.user_id = ic.user_id
                             WHERE c.id = NEW.cliente_id AND ic.cliente_id IS NULL)) THEN
      RAISE EXCEPTION 'Este projeto não tem Instagram conectado: a Dalila não publica no perfil de outro projeto. Conecte o Instagram dele primeiro.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER carrossel_confere_instagram BEFORE INSERT OR UPDATE OF status ON public.carrosseis
  FOR EACH ROW EXECUTE FUNCTION public.carrossel_confere_instagram();
