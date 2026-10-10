-- "Separar ideias" passa a rodar no próprio Jarvis (headline = primeira frase
-- falada, tradução pelo Google), sem depender da sessão do Claude. O app do
-- dono agora conclui a ideia: pode atualizar status, headline, tradução e o
-- documento — só nas próprias ideias. O INSERT continua sem headline.
CREATE POLICY "account_owner_update" ON public.creator_ideias FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT UPDATE (status, headline_original, headline_pt, traducao_pt, documento_id, erro) ON public.creator_ideias TO authenticated;
