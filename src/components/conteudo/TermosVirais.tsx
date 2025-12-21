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

interface TermoViral {
  id: string;
  categoria: string;
  termo: string;
  ordem: number;
}

interface TermosViraisProps {
  clienteId: string;
}

const categoriasBase = [
  {
    id: "hooks",
    titulo: "Hooks",
    subtitulo: "Frases de abertura que prendem atenção",
    cor: "purple",
  },
  {
    id: "ctas",
    titulo: "CTAs",
    subtitulo: "Chamadas para ação",
    cor: "blue",
  },
  {
    id: "frases",
    titulo: "Frases de Impacto",
    subtitulo: "Frases marcantes e memoráveis",
    cor: "orange",
  },
  {
    id: "geral",
    titulo: "Geral",
    subtitulo: "Outros termos virais",
    cor: "green",
  },
];

const coresDisponiveis: Record<string, string> = {
  purple: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  blue: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  orange: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  green: "bg-green-500/20 text-green-700 dark:text-green-400",
};

const getCorClasses = (cor: string) => {
  return coresDisponiveis[cor] || coresDisponiveis.green;
};

export function TermosVirais({ clienteId }: TermosViraisProps) {
  const [items, setItems] = useState<TermoViral[]>([]);
  const [openCategories, setOpenCategories] = useState<string[]>(["hooks"]);
  const [novoTexto, setNovoTexto] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [clienteId]);

  const carregarDados = async () => {
    try {
      const { data, error } = await supabase
        .from("termos_virais")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("ordem");

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Erro ao carregar termos virais:", error);
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
    const termo = novoTexto[categoria]?.trim();
    if (!termo) return;

    const itemsCategoria = items.filter((i) => i.categoria === categoria);
    const novaOrdem = itemsCategoria.length + 1;

    try {
      const { data, error } = await supabase
        .from("termos_virais")
        .insert({
          cliente_id: clienteId,
          categoria,
          termo,
          ordem: novaOrdem,
        })
        .select()
        .single();

      if (error) throw error;

      setItems([...items, data]);
      setNovoTexto((prev) => ({ ...prev, [categoria]: "" }));
    } catch (error) {
      console.error("Erro ao adicionar termo:", error);
      toast({ title: "Erro ao adicionar termo", variant: "destructive" });
    }
  };

  const excluirItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from("termos_virais")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setItems(items.filter((i) => i.id !== id));
    } catch (error) {
      console.error("Erro ao excluir termo:", error);
      toast({ title: "Erro ao excluir termo", variant: "destructive" });
    }
  };

  const getItemsPorCategoria = (categoria: string) =>
    items.filter((i) => i.categoria === categoria);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Termos Virais</h3>
        <p className="text-sm text-muted-foreground">
          Digite <code className="bg-muted px-1 rounded">//</code> nos roteiros para inserir
        </p>
      </div>

      <div className="space-y-3">
        {categoriasBase.map((cat) => {
          const catItems = getItemsPorCategoria(cat.id);
          const isOpen = openCategories.includes(cat.id);
          const corClasses = getCorClasses(cat.cor);

          return (
            <Collapsible key={cat.id} open={isOpen} onOpenChange={() => toggleCategory(cat.id)}>
              <CollapsibleTrigger asChild>
                <button
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg ${corClasses} transition-colors`}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{cat.titulo}</span>
                    {cat.subtitulo && (
                      <span className="text-sm opacity-70">{cat.subtitulo}</span>
                    )}
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
                      <span className="flex-1 text-sm">{item.termo}</span>
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
