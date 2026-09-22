import { useState } from "react";
import { Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface MindMapKanbanPickerItem {
  id: string;
  titulo: string;
  concluida: boolean;
}

interface MindMapKanbanPickerProps {
  atividades: MindMapKanbanPickerItem[];
  onSelect: (atividadeId: string) => void;
}

// Popover de busca pra "puxar" uma atividade já existente do Kanban pra
// dentro da lousa (item complementar ao botão "Novo card", que cria uma
// atividade nova do zero).
export function MindMapKanbanPicker({ atividades, onSelect }: MindMapKanbanPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Adicionar do Kanban">
          <Kanban className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar atividade..." />
          <CommandList>
            <CommandEmpty>Nenhuma atividade encontrada.</CommandEmpty>
            <CommandGroup>
              {atividades.map((atividade) => (
                <CommandItem
                  key={atividade.id}
                  value={atividade.titulo}
                  onSelect={() => {
                    onSelect(atividade.id);
                    setOpen(false);
                  }}
                >
                  <span className={atividade.concluida ? "text-muted-foreground line-through" : ""}>
                    {atividade.titulo}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
