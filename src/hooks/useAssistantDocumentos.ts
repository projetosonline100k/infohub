import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AssistantDocumento = Pick<Tables<"documentos">, "id" | "titulo" | "conteudo" | "created_at" | "updated_at" | "cliente_id">;

// Mesmos prefixos que CadernoEditor/MindMapEditor já usam pra marcar o
// "tipo" de um documento dentro do campo `conteudo` (ver
// CadernoEditor.tsx:24, MindMapEditor.tsx:53) — sigo a mesma convenção pra
// notas rápidas em vez de criar uma tabela nova.
const CADERNO_PREFIX = "__CADERNO_V1__";
const CANVAS_PREFIX = "__CANVASMENTAL_V1__";
export const NOTA_PREFIX = "__NOTA_RAPIDA_V1__";

function ehDocumentoComum(conteudo: string | null): boolean {
  if (!conteudo) return true;
  return !conteudo.startsWith(CADERNO_PREFIX) && !conteudo.startsWith(CANVAS_PREFIX) && !conteudo.startsWith(NOTA_PREFIX);
}

// Docs + Notas do Assistant, ambos sobre a MESMA tabela `documentos` já
// usada por DocumentosView.tsx — sem tabela nova. Notas são documentos
// comuns com o conteúdo prefixado (mesma técnica de Caderno/Mapa Mental);
// Docs é tudo o mais. Escopado sempre por um projeto (cliente_id) — sem
// projeto selecionado, não busca nada (evita colidir com o documento
// singleton de "Notas Pessoais" que já existe em cliente_id NULL).
export function useAssistantDocumentos(clienteId: string | null) {
  const [documentos, setDocumentos] = useState<AssistantDocumento[]>([]);
  const [notas, setNotas] = useState<AssistantDocumento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setDocumentos([]);
      setNotas([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("documentos")
      .select("id, titulo, conteudo, created_at, updated_at, cliente_id")
      .eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false });
    if (!error) {
      const todos = data || [];
      setDocumentos(todos.filter((d) => ehDocumentoComum(d.conteudo)));
      setNotas(todos.filter((d) => d.conteudo?.startsWith(NOTA_PREFIX)));
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Mesmo insert que DocumentosView.tsx:219-228 (criarNovoDocumento).
  const criarDocumento = useCallback(async (titulo: string) => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({ cliente_id: clienteId, titulo })
      .select("id, titulo, conteudo, created_at, updated_at, cliente_id")
      .single();
    if (error || !data) throw error || new Error("Falha ao criar documento");
    setDocumentos((prev) => [data, ...prev]);
    return data;
  }, [clienteId]);

  const criarNota = useCallback(async (titulo: string, conteudo: string) => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({ cliente_id: clienteId, titulo: titulo || "Nota sem título", conteudo: NOTA_PREFIX + conteudo })
      .select("id, titulo, conteudo, created_at, updated_at, cliente_id")
      .single();
    if (error || !data) throw error || new Error("Falha ao criar nota");
    setNotas((prev) => [data, ...prev]);
    return data;
  }, [clienteId]);

  return { documentos, notas, loading, refetch: carregar, criarDocumento, criarNota };
}

export function conteudoDaNota(nota: AssistantDocumento): string {
  return (nota.conteudo || "").slice(NOTA_PREFIX.length);
}
