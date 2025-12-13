-- Tabela para perfis parecidos
CREATE TABLE public.perfis_parecidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  imagem_url TEXT,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para núcleo de influência (desejos, problemas, medos)
CREATE TABLE public.nucleo_influencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('desejos', 'problemas', 'medos')),
  texto TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para ideias de conteúdo
CREATE TABLE public.ideias_conteudo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.perfis_parecidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nucleo_influencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideias_conteudo ENABLE ROW LEVEL SECURITY;

-- Policies for perfis_parecidos
CREATE POLICY "Permitir leitura de perfis" ON public.perfis_parecidos FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de perfis" ON public.perfis_parecidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de perfis" ON public.perfis_parecidos FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de perfis" ON public.perfis_parecidos FOR DELETE USING (true);

-- Policies for nucleo_influencia
CREATE POLICY "Permitir leitura de nucleo" ON public.nucleo_influencia FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de nucleo" ON public.nucleo_influencia FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de nucleo" ON public.nucleo_influencia FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de nucleo" ON public.nucleo_influencia FOR DELETE USING (true);

-- Policies for ideias_conteudo
CREATE POLICY "Permitir leitura de ideias" ON public.ideias_conteudo FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de ideias" ON public.ideias_conteudo FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de ideias" ON public.ideias_conteudo FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de ideias" ON public.ideias_conteudo FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_perfis_cliente ON public.perfis_parecidos(cliente_id);
CREATE INDEX idx_nucleo_cliente ON public.nucleo_influencia(cliente_id);
CREATE INDEX idx_ideias_cliente ON public.ideias_conteudo(cliente_id);