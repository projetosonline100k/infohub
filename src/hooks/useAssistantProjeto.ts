import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AssistantProjetoOpcao {
  id: string;
  nome: string;
}

export type AssistantFiltroDia = "hoje" | "amanha" | "semana" | "data";

export interface AssistantFiltroData {
  tipo: AssistantFiltroDia;
  // Só usado quando tipo === "data" (yyyy-MM-dd).
  data: string | null;
}

const CHAVE_PROJETO = "assistantProjeto";
const CHAVE_FILTRO_DIA = "assistantFiltroDia";

const lerFiltroSalvo = (): AssistantFiltroData => {
  try {
    const salvo = localStorage.getItem(CHAVE_FILTRO_DIA);
    if (salvo) {
      const parsed = JSON.parse(salvo);
      if (parsed?.tipo) return { tipo: parsed.tipo, data: parsed.data ?? null };
    }
  } catch {
    /* ignora */
  }
  return { tipo: "hoje", data: null };
};

// "Projeto" no vocabulário do Assistant é a mesma tabela `clientes` (o menu
// já chama isso de "Projetos Milionários" — ver DashboardLayout.tsx). Mesmo
// padrão de busca já usado em AtividadesClientesView.tsx (clientes não
// arquivados, ordenados por nome). Nenhuma tabela nova.
export function useAssistantProjeto() {
  const [projetos, setProjetos] = useState<AssistantProjetoOpcao[]>([]);
  const [loadingProjetos, setLoadingProjetos] = useState(true);

  const [projetoId, setProjetoIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_PROJETO);
    } catch {
      return null;
    }
  });

  const setProjetoId = useCallback((id: string | null) => {
    setProjetoIdState(id);
    try {
      if (id) localStorage.setItem(CHAVE_PROJETO, id);
      else localStorage.removeItem(CHAVE_PROJETO);
    } catch {
      /* ignora — só perde a persistência */
    }
  }, []);

  const [filtroDia, setFiltroDiaState] = useState<AssistantFiltroData>(lerFiltroSalvo);
  const setFiltroDia = useCallback((filtro: AssistantFiltroData) => {
    setFiltroDiaState(filtro);
    try {
      localStorage.setItem(CHAVE_FILTRO_DIA, JSON.stringify(filtro));
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setLoadingProjetos(true);
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome_especialista")
        .eq("arquivado", false)
        .order("nome_especialista", { ascending: true });
      if (cancelado) return;
      if (!error) setProjetos((data || []).map((c) => ({ id: c.id, nome: c.nome_especialista })));
      setLoadingProjetos(false);
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  // O projeto salvo pode ter sido arquivado/excluído entre uma sessão e
  // outra — solta a seleção pra não filtrar por um id que não existe mais.
  useEffect(() => {
    if (!loadingProjetos && projetoId && !projetos.some((p) => p.id === projetoId)) {
      setProjetoId(null);
    }
  }, [loadingProjetos, projetoId, projetos, setProjetoId]);

  const projetoAtual = projetos.find((p) => p.id === projetoId) ?? null;

  return { projetos, loadingProjetos, projetoId, projetoAtual, setProjetoId, filtroDia, setFiltroDia };
}
