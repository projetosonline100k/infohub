import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface NucleoItem {
  id: string;
  categoria: string;
  texto: string;
}

interface CategoriaCustom {
  id: string;
  titulo: string;
  subtitulo: string | null;
  cor: string;
}

interface CategoriaAgrupada {
  id: string;
  titulo: string;
  subtitulo: string | null;
  isCustom: boolean;
  items: NucleoItem[];
}

const categoriasBase = [
  { id: "desejos", titulo: "Desejos", subtitulo: "O que seu avatar deseja alcançar" },
  { id: "problemas", titulo: "Problemas/Dores", subtitulo: "O que incomoda seu avatar" },
  { id: "medos", titulo: "Medos", subtitulo: "O que seu avatar tem medo" },
];

export function useNucleoInfluencia(clienteId: string) {
  const [categorias, setCategorias] = useState<CategoriaAgrupada[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [nucleoRes, categoriasRes] = await Promise.all([
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

        const nucleoItems = nucleoRes.data || [];
        const categoriasCustom = categoriasRes.data || [];

        // Agrupa items por categoria
        const todasCategorias: CategoriaAgrupada[] = [
          ...categoriasBase.map((cat) => ({
            ...cat,
            isCustom: false,
            items: nucleoItems.filter((item) => item.categoria === cat.id),
          })),
          ...categoriasCustom.map((cat) => ({
            id: cat.id,
            titulo: cat.titulo,
            subtitulo: cat.subtitulo,
            isCustom: true,
            items: nucleoItems.filter((item) => item.categoria === cat.id),
          })),
        ];

        // Filtra categorias vazias
        setCategorias(todasCategorias.filter((cat) => cat.items.length > 0));
      } catch (error) {
        console.error("Erro ao carregar núcleo de influência:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clienteId]);

  return { categorias, loading };
}
