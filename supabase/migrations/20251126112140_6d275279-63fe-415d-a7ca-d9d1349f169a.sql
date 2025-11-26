-- Permitir leitura pública de pesquisas (para exibir o formulário)
CREATE POLICY "Permitir leitura pública de pesquisas"
ON public.pesquisas
FOR SELECT
TO anon
USING (true);

-- Permitir leitura pública de perguntas (para exibir as perguntas)
CREATE POLICY "Permitir leitura pública de perguntas"
ON public.perguntas_pesquisa
FOR SELECT
TO anon
USING (true);

-- Permitir inserção anônima de respostas (para enviar respostas)
CREATE POLICY "Permitir inserção anônima de respostas"
ON public.respostas_pesquisa
FOR INSERT
TO anon
WITH CHECK (true);