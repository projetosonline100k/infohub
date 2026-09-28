import { UserRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FiltroResponsavel as Filtro } from "@/lib/atividades/filtroResponsavel";

export function FiltroResponsavel({ value, onChange }: { value: Filtro; onChange: (value: Filtro) => void }) {
  return (
    <Select value={value} onValueChange={(valor) => onChange(valor as Filtro)}>
      <SelectTrigger className="h-8 w-[156px] gap-1.5 text-xs" aria-label="Filtrar atividades por responsável">
        <UserRound className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todas">Todas</SelectItem>
        <SelectItem value="minhas">Só minhas</SelectItem>
        <SelectItem value="outras">Outras pessoas</SelectItem>
        <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
      </SelectContent>
    </Select>
  );
}
