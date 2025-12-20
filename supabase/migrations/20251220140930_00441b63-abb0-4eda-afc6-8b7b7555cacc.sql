-- Criar tabela de conhecimentos/documentos por agente
CREATE TABLE public.conhecimentos_agente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id UUID REFERENCES public.agentes_ia(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'pdf',
  conteudo_extraido TEXT,
  arquivo_url TEXT,
  caracteres INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conhecimentos_agente ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Permitir leitura de conhecimentos" ON public.conhecimentos_agente FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de conhecimentos" ON public.conhecimentos_agente FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de conhecimentos" ON public.conhecimentos_agente FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de conhecimentos" ON public.conhecimentos_agente FOR DELETE USING (true);

-- Criar bucket para armazenar arquivos de conhecimento
INSERT INTO storage.buckets (id, name, public) VALUES ('conhecimentos', 'conhecimentos', true);

-- Policies para o bucket
CREATE POLICY "Conhecimentos são públicos para leitura" ON storage.objects FOR SELECT USING (bucket_id = 'conhecimentos');
CREATE POLICY "Permitir upload de conhecimentos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'conhecimentos');
CREATE POLICY "Permitir exclusão de conhecimentos" ON storage.objects FOR DELETE USING (bucket_id = 'conhecimentos');