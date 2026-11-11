-- A prévia do link (Instagram, WhatsApp…) não é clique de gente: resolver_link_curto só conta quando pedirem (p_contar).
DROP FUNCTION public.resolver_link_curto(text);
CREATE OR REPLACE FUNCTION public.resolver_link_curto(p_codigo text, p_contar boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF p_contar THEN
    UPDATE links_curtos SET cliques = cliques + 1 WHERE codigo = lower(btrim(p_codigo)) RETURNING destino INTO d;
  ELSE
    SELECT destino INTO d FROM links_curtos WHERE codigo = lower(btrim(p_codigo));
  END IF;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_link_curto(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_link_curto(text, boolean) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
