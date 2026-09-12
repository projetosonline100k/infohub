import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export interface AtividadeEncontrada {
  id: string;
  titulo: string;
  cliente_id: string | null;
  clienteNome: string;
}

interface AtividadePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (atividade: AtividadeEncontrada) => void;
}

export const AtividadePicker = ({ open, onClose, onSelect }: AtividadePickerProps) => {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<AtividadeEncontrada[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open) setBusca("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setCarregando(true);

    const handle = setTimeout(async () => {
      let query = supabase
        .from("atividades")
        .select("id, titulo, cliente_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (busca.trim()) query = query.ilike("titulo", `%${busca.trim()}%`);

      const { data, error } = await query;
      if (cancelado) return;
      if (error) {
        console.error("Erro ao buscar atividades:", error);
        setCarregando(false);
        return;
      }

      const clienteIds = Array.from(new Set((data || []).map((a) => a.cliente_id).filter(Boolean))) as string[];
      let nomes: Record<string, string> = {};
      if (clienteIds.length > 0) {
        const { data: clientesData } = await supabase
          .from("clientes")
          .select("id, nome_especialista")
          .in("id", clienteIds);
        nomes = Object.fromEntries((clientesData || []).map((c) => [c.id, c.nome_especialista]));
      }

      setResultados(
        (data || []).map((a) => ({
          id: a.id,
          titulo: a.titulo,
          cliente_id: a.cliente_id,
          clienteNome: a.cliente_id ? nomes[a.cliente_id] || "" : "Pessoal",
        }))
      );
      setCarregando(false);
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(handle);
    };
  }, [busca, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Puxar atividade</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título..."
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1">
          {carregando ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nada encontrado</p>
          ) : (
            resultados.map((atividade) => (
              <button
                key={atividade.id}
                onClick={() => onSelect(atividade)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm">{atividade.titulo}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{atividade.clienteNome}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
