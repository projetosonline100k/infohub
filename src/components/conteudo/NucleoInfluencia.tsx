import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, ChevronDown, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface NucleoItem {
  id: string;
  categoria: string;
  texto: string;
  ordem: number;
}

interface CategoriaCustom {
  id: string;
  titulo: string;
  subtitulo: string | null;
  cor: string;
  ordem: number;
}

interface NucleoInfluenciaProps {
  clienteId: string;
}

const categoriasBase = [
  {
    id: "desejos",
    titulo: "Desejos",
    subtitulo: "(Gatilho da Recompensa)",
    cor: "green",
  },
  {
    id: "problemas",
    titulo: "Problemas/Dores",
    subtitulo: "(Gatilho da Recompensa)",
    cor: "yellow",
  },
  {
    id: "medos",
    titulo: "Medos",
    subtitulo: "(Gatilho da Crença)",
    cor: "red",
  },
];

const coresDisponiveis = [
  { id: "green", label: "Verde", classes: "bg-green-500/20 text-green-700 dark:text-green-400" },
  { id: "yellow", label: "Amarelo", classes: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" },
  { id: "red", label: "Vermelho", classes: "bg-red-500/20 text-red-700 dark:text-red-400" },
  { id: "blue", label: "Azul", classes: "bg-blue-500/20 text-blue-700 dark:text-blue-400" },
  { id: "purple", label: "Roxo", classes: "bg-purple-500/20 text-purple-700 dark:text-purple-400" },
  { id: "orange", label: "Laranja", classes: "bg-orange-500/20 text-orange-700 dark:text-orange-400" },
  { id: "pink", label: "Rosa", classes: "bg-pink-500/20 text-pink-700 dark:text-pink-400" },
];

const getCorClasses = (cor: string) => {
  return coresDisponiveis.find(c => c.id === cor)?.classes || coresDisponiveis[0].classes;
};

export function NucleoInfluencia({ clienteId }: NucleoInfluenciaProps) {
  const [items, setItems] = useState<NucleoItem[]>([]);
  const [categoriasCustom, setCategoriasCustom] = useState<CategoriaCustom[]>([]);
  const [openCategories, setOpenCategories] = useState<string[]>(["desejos"]);
  const [novoTexto, setNovoTexto] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoSubtitulo, setNovoSubtitulo] = useState("");
  const [novaCor, setNovaCor] = useState("blue");

  useEffect(() => {
    carregarDados();
  }, [clienteId]);

  const carregarDados = async () => {
    try {
      const [itemsRes, categoriasRes] = await Promise.all([
        supabase
          .from("nucleo_influencia")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("ordem"),
        supabase
          .from("categorias_nucleo")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("ordem"),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (categoriasRes.error) throw categoriasRes.error;

      setItems(itemsRes.data || []);
      setCategoriasCustom(categoriasRes.data || []);
    } catch (error) {
      console.error("Erro ao carregar núcleo:", error);
    } finally {
      setLoading(false);
    }
  };

  const todasCategorias = [
    ...categoriasBase.map(c => ({ ...c, isCustom: false })),
    ...categoriasCustom.map(c => ({ 
      id: c.id, 
      titulo: c.titulo, 
      subtitulo: c.subtitulo || "", 
      cor: c.cor,
      isCustom: true 
    })),
  ];

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

  const adicionarCategoria = async () => {
    if (!novoTitulo.trim()) return;

    try {
      const novaOrdem = categoriasCustom.length + 1;
      const { data, error } = await supabase
        .from("categorias_nucleo")
        .insert({
          cliente_id: clienteId,
          titulo: novoTitulo.trim(),
          subtitulo: novoSubtitulo.trim() || null,
          cor: novaCor,
          ordem: novaOrdem,
        })
        .select()
        .single();

      if (error) throw error;

      setCategoriasCustom([...categoriasCustom, data]);
      setNovoTitulo("");
      setNovoSubtitulo("");
      setNovaCor("blue");
      setModalOpen(false);
      toast({ title: "Categoria adicionada!" });
    } catch (error) {
      console.error("Erro ao adicionar categoria:", error);
      toast({ title: "Erro ao adicionar categoria", variant: "destructive" });
    }
  };

  const excluirCategoria = async (id: string) => {
    try {
      // Delete items belonging to this category first
      await supabase
        .from("nucleo_influencia")
        .delete()
        .eq("cliente_id", clienteId)
        .eq("categoria", id);

      const { error } = await supabase
        .from("categorias_nucleo")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setCategoriasCustom(categoriasCustom.filter((c) => c.id !== id));
      setItems(items.filter((i) => i.categoria !== id));
      toast({ title: "Categoria excluída" });
    } catch (error) {
      console.error("Erro ao excluir categoria:", error);
      toast({ title: "Erro ao excluir categoria", variant: "destructive" });
    }
  };

  const getItemsPorCategoria = (categoria: string) =>
    items.filter((i) => i.categoria === categoria);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Núcleo de influência</h3>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nova categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-background">
            <DialogHeader>
              <DialogTitle>Nova categoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título</Label>
                <Input
                  id="titulo"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Objeções"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subtitulo">Subtítulo (opcional)</Label>
                <Input
                  id="subtitulo"
                  value={novoSubtitulo}
                  onChange={(e) => setNovoSubtitulo(e.target.value)}
                  placeholder="Ex: (Gatilho da Prova)"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <RadioGroup value={novaCor} onValueChange={setNovaCor} className="flex flex-wrap gap-2">
                  {coresDisponiveis.map((cor) => (
                    <div key={cor.id} className="flex items-center">
                      <RadioGroupItem value={cor.id} id={cor.id} className="sr-only" />
                      <Label
                        htmlFor={cor.id}
                        className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${cor.classes} ${
                          novaCor === cor.id ? "ring-2 ring-offset-2 ring-foreground/50" : ""
                        }`}
                      >
                        {cor.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <Button onClick={adicionarCategoria} className="w-full" disabled={!novoTitulo.trim()}>
                Adicionar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {todasCategorias.map((cat) => {
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{catItems.length}</span>
                    {cat.isCustom && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:bg-destructive/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          excluirCategoria(cat.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
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
