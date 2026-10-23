-- Arrumação do Mapa da Operação por projeto (23/10, Davi: "quero ter a opção de apagar um espaço,
-- encaixar de forma diferente"). As 9 salas do losango, da de cima (0) para a da frente (8), linha a linha:
-- {"celulas": ["setor:<id>" | "recepcao" | "reuniao" | "copa" | "descanso" | "vazio", ... 9 itens]}.
-- Sem valor: arrumação padrão. Quem pode editar o projeto pode mudar (policy de UPDATE de clientes).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS escritorio_layout jsonb;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_escritorio_layout_formato;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_escritorio_layout_formato CHECK (
  escritorio_layout IS NULL OR (
    jsonb_typeof(escritorio_layout -> 'celulas') = 'array' AND jsonb_array_length(escritorio_layout -> 'celulas') = 9
  )
);

NOTIFY pgrst, 'reload schema';
