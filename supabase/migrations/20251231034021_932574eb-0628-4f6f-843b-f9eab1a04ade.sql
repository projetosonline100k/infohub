-- Adicionar coluna de imagem nos nós do funil
ALTER TABLE funil_vendas ADD COLUMN IF NOT EXISTS imagem_url TEXT;

-- Criar tabela de categorias do funil
CREATE TABLE IF NOT EXISTS funil_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos_cliente(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT 'Funil Principal',
  ordem INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE funil_categorias ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para funil_categorias
CREATE POLICY "Permitir leitura de categorias funil" ON funil_categorias FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de categorias funil" ON funil_categorias FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de categorias funil" ON funil_categorias FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de categorias funil" ON funil_categorias FOR DELETE USING (true);

-- Adicionar referência de categoria nos nós do funil
ALTER TABLE funil_vendas ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES funil_categorias(id) ON DELETE CASCADE;