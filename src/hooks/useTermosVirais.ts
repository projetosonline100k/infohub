import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TermoViral {
  id: string;
  termo: string;
  categoria: string;
  ordem: number;
}

interface CategoriaAgrupada {
  id: string;
  titulo: string;
  items: TermoViral[];
}

const categoriasBase = [
  { id: "hooks", titulo: "Hooks" },
  { id: "ctas", titulo: "CTAs" },
  { id: "frases", titulo: "Frases de Impacto" },
  { id: "geral", titulo: "Geral" },
];

export function useTermosVirais(clienteId: string) {
  const [categorias, setCategorias] = useState<CategoriaAgrupada[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("termos_virais")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("ordem");

        if (error) throw error;

        const termos = data || [];

        // Agrupa termos por categoria
        const todasCategorias: CategoriaAgrupada[] = categoriasBase.map((cat) => ({
          id: cat.id,
          titulo: cat.titulo,
          items: termos.filter((termo) => termo.categoria === cat.id),
        }));

        // Filtra categorias vazias
        setCategorias(todasCategorias.filter((cat) => cat.items.length > 0));
      } catch (error) {
        console.error("Erro ao carregar termos virais:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clienteId]);

  return { categorias, loading };
}
