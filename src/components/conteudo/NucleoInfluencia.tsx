import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NucleoItem {
  id: string;
  categoria: string;
  texto: string;
  ordem: number;
}

interface NucleoInfluenciaProps {
  clienteId: string;
}

const categorias = [
  {
    id: "desejos",
    titulo: "Desejos",
    subtitulo: "(Gatilho da Recompensa)",
    cor: "bg-green-500/20 text-green-700 dark:text-green-400",
  },
  {
    id: "problemas",
    titulo: "Problemas/Dores",
    subtitulo: "(Gatilho da Recompensa)",
    cor: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  },
  {
    id: "medos",
    titulo: "Medos",
    subtitulo: "(Gatilho da Crença)",
    cor: "bg-red-500/20 text-red-700 dark:text-red-400",
  },
];

export function NucleoInfluencia({ clienteId }: NucleoInfluenciaProps) {
  const [items, setItems] = useState<NucleoItem[]>([]);
  const [openCategories, setOpenCategories] = useState<string[]>(["desejos"]);
  const [novoTexto, setNovoTexto] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarItems();
  }, [clienteId]);

  const carregarItems = async () => {
    try {
      const { data, error } = await supabase
        .from("nucleo_influencia")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("ordem");

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Erro ao carregar núcleo:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (catId: string) => {
    setOpenCategories((prev) =>
      prev.includes(catId)
        ? prev.filter((id) => id !== catId)
        : [...prev, catId]
    );
  };

  const adicionarItem = async (categoria: string) => {
    const texto = novoTexto[categoria]?.trim();
    if (!texto) return;

    const itemsCategoria = items.filter((i) => i.categoria === categoria);
    const novaOrdem = itemsCategoria.length + 1;

    try {
      const { data, error } = await supabase
        .from("nucleo_influencia")
        .insert({
          cliente_id: clienteId,
          categoria,
          texto,
          ordem: novaOrdem,
        })
        .select()
        .single();

      if (error) throw error;

      setItems([...items, data]);
      setNovoTexto((prev) => ({ ...prev, [categoria]: "" }));
    } catch (error) {
      console.error("Erro ao adicionar item:", error);
      toast({ title: "Erro ao adicionar item", variant: "destructive" });
    }
  };

  const excluirItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from("nucleo_influencia")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setItems(items.filter((i) => i.id !== id));
    } catch (error) {
      console.error("Erro ao excluir item:", error);
      toast({ title: "Erro ao excluir item", variant: "destructive" });
    }
  };

  const getItemsPorCategoria = (categoria: string) =>
    items.filter((i) => i.categoria === categoria);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Núcleo de influência</h3>
      <div className="space-y-3">
        {categorias.map((cat) => {
          const catItems = getItemsPorCategoria(cat.id);
          const isOpen = openCategories.includes(cat.id);

          return (
            <Collapsible key={cat.id} open={isOpen} onOpenChange={() => toggleCategory(cat.id)}>
              <CollapsibleTrigger asChild>
                <button
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg ${cat.cor} transition-colors`}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{cat.titulo}</span>
                    <span className="text-sm opacity-70">{cat.subtitulo}</span>
                  </div>
                  <span className="text-sm font-medium">{catItems.length}</span>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-2 pl-6 space-y-2">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 group"
                    >
                      <div className="w-2 h-2 rounded-full bg-foreground/30" />
                      <span className="flex-1 text-sm">{item.texto}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => excluirItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Input para novo item */}
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      value={novoTexto[cat.id] || ""}
                      onChange={(e) =>
                        setNovoTexto((prev) => ({
                          ...prev,
                          [cat.id]: e.target.value,
                        }))
                      }
                      placeholder={`Adicionar ${cat.titulo.toLowerCase()}...`}
                      className="text-sm h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          adicionarItem(cat.id);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => adicionarItem(cat.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
