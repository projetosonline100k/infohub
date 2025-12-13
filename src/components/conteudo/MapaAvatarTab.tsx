import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PerfilCard } from "./PerfilCard";
import { NucleoInfluencia } from "./NucleoInfluencia";
import { Button } from "@/components/ui/button";

interface Perfil {
  id: string;
  nome: string;
  descricao?: string;
  imagem_url?: string;
  ordem: number;
  link_perfil?: string;
  plataforma?: string;
}

interface MapaAvatarTabProps {
  clienteId: string;
}

type FiltroPlataforma = "todos" | "youtube" | "conteudo_curto";

export function MapaAvatarTab({ clienteId }: MapaAvatarTabProps) {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroPlataforma>("todos");

  useEffect(() => {
    carregarPerfis();
  }, [clienteId]);

  const carregarPerfis = async () => {
    try {
      const { data, error } = await supabase
        .from("perfis_parecidos")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("ordem");

      if (error) throw error;
      setPerfis(data || []);
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);
    } finally {
      setLoading(false);
    }
  };

  const adicionarPerfil = async (plataforma: string) => {
    const novaOrdem = perfis.length + 1;
    
    try {
      const { data, error } = await supabase
        .from("perfis_parecidos")
        .insert({
          cliente_id: clienteId,
          nome: `Perfil ${novaOrdem}`,
          ordem: novaOrdem,
          plataforma,
        })
        .select()
        .single();

      if (error) throw error;
      
      setPerfis([...perfis, data]);
      toast({ title: "Perfil adicionado!" });
    } catch (error) {
      console.error("Erro ao adicionar perfil:", error);
      toast({ title: "Erro ao adicionar perfil", variant: "destructive" });
    }
  };

  const atualizarPerfil = async (id: string, dados: Partial<Perfil>) => {
    try {
      const { error } = await supabase
        .from("perfis_parecidos")
        .update(dados)
        .eq("id", id);

      if (error) throw error;
      
      setPerfis(perfis.map((p) => (p.id === id ? { ...p, ...dados } : p)));
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      toast({ title: "Erro ao atualizar perfil", variant: "destructive" });
    }
  };

  const excluirPerfil = async (id: string) => {
    try {
      const { error } = await supabase
        .from("perfis_parecidos")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      setPerfis(perfis.filter((p) => p.id !== id));
      toast({ title: "Perfil removido!" });
    } catch (error) {
      console.error("Erro ao excluir perfil:", error);
      toast({ title: "Erro ao excluir perfil", variant: "destructive" });
    }
  };

  // Filtrar perfis por plataforma
  const perfisFiltrados = filtro === "todos" 
    ? perfis 
    : perfis.filter(p => p.plataforma === filtro);

  // Garantir 5 slots de cards
  const slots = Array.from({ length: 5 }, (_, i) => perfisFiltrados[i] || null);

  return (
    <div className="space-y-8">
      {/* Perfis parecidos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Perfis parecidos</h3>
          <div className="flex gap-2">
            <Button
              variant={filtro === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("todos")}
            >
              Todos
            </Button>
            <Button
              variant={filtro === "youtube" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("youtube")}
            >
              YouTube
            </Button>
            <Button
              variant={filtro === "conteudo_curto" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("conteudo_curto")}
            >
              Conteúdo Curto
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {slots.map((perfil, index) => (
            <PerfilCard
              key={perfil?.id || `slot-${index}`}
              perfil={perfil}
              onAdd={adicionarPerfil}
              onUpdate={atualizarPerfil}
              onDelete={excluirPerfil}
              filtroAtual={filtro}
            />
          ))}
        </div>
      </div>

      {/* Núcleo de influência */}
      <NucleoInfluencia clienteId={clienteId} />
    </div>
  );
}
