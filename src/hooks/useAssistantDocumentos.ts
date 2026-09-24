import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AssistantDocumento = Pick<
  Tables<"documentos">,
  "id" | "titulo" | "conteudo" | "created_at" | "updated_at" | "cliente_id" | "fixado" | "pasta_id" | "deleted_at"
>;

const SELECT_FIELDS = "id, titulo, conteudo, created_at, updated_at, cliente_id, fixado, pasta_id, deleted_at";

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
  // Notas na lixeira (deleted_at setado) — item 2: "Lixeira" na Coluna 1.
  const [notasLixeira, setNotasLixeira] = useState<AssistantDocumento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) {
      setDocumentos([]);
      setNotas([]);
      setNotasLixeira([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("documentos")
      .select(SELECT_FIELDS)
      .eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false });
    if (!error) {
      const todos = data || [];
      setDocumentos(todos.filter((d) => !d.deleted_at && ehDocumentoComum(d.conteudo)));
      setNotas(todos.filter((d) => !d.deleted_at && d.conteudo?.startsWith(NOTA_PREFIX)));
      setNotasLixeira(todos.filter((d) => d.deleted_at && d.conteudo?.startsWith(NOTA_PREFIX)));
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
      .select(SELECT_FIELDS)
      .single();
    if (error || !data) throw error || new Error("Falha ao criar documento");
    setDocumentos((prev) => [data, ...prev]);
    return data;
  }, [clienteId]);

  const criarNota = useCallback(async (titulo: string, conteudo: string, pastaId: string | null = null) => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({ cliente_id: clienteId, titulo: titulo || "Nota sem título", conteudo: NOTA_PREFIX + conteudo, pasta_id: pastaId })
      .select(SELECT_FIELDS)
      .single();
    if (error || !data) throw error || new Error("Falha ao criar nota");
    setNotas((prev) => [data, ...prev]);
    return data;
  }, [clienteId]);

  // Fixar/desafixar (item 9) — mesma tabela, só a coluna nova.
  const fixarNota = useCallback(async (id: string, fixado: boolean) => {
    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, fixado } : n)));
    const { error } = await supabase.from("documentos").update({ fixado }).eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  const moverNotaParaPasta = useCallback(async (id: string, pastaId: string | null) => {
    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, pasta_id: pastaId } : n)));
    const { error } = await supabase.from("documentos").update({ pasta_id: pastaId }).eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  const duplicarNota = useCallback(async (id: string) => {
    const original = notas.find((n) => n.id === id);
    if (!original) return;
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        titulo: `${original.titulo} (cópia)`,
        conteudo: original.conteudo,
        pasta_id: original.pasta_id,
      })
      .select(SELECT_FIELDS)
      .single();
    if (error || !data) throw error || new Error("Falha ao duplicar nota");
    setNotas((prev) => [data, ...prev]);
    return data;
  }, [clienteId, notas]);

  // "Excluir" move pra lixeira (soft-delete, item 2) — não apaga de
  // verdade. Excluir de vez é uma ação separada, só disponível dentro da
  // própria Lixeira.
  const excluirNota = useCallback(async (id: string) => {
    const agora = new Date().toISOString();
    const nota = notas.find((n) => n.id === id);
    setNotas((prev) => prev.filter((n) => n.id !== id));
    if (nota) setNotasLixeira((prev) => [{ ...nota, deleted_at: agora }, ...prev]);
    const { error } = await supabase.from("documentos").update({ deleted_at: agora }).eq("id", id);
    if (error) await carregar();
  }, [carregar, notas]);

  const restaurarNota = useCallback(async (id: string) => {
    const nota = notasLixeira.find((n) => n.id === id);
    setNotasLixeira((prev) => prev.filter((n) => n.id !== id));
    if (nota) setNotas((prev) => [{ ...nota, deleted_at: null }, ...prev]);
    const { error } = await supabase.from("documentos").update({ deleted_at: null }).eq("id", id);
    if (error) await carregar();
  }, [carregar, notasLixeira]);

  const excluirNotaPermanente = useCallback(async (id: string) => {
    setNotasLixeira((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from("documentos").delete().eq("id", id);
    if (error) await carregar();
  }, [carregar]);

  return {
    documentos,
    notas,
    notasLixeira,
    loading,
    refetch: carregar,
    criarDocumento,
    criarNota,
    fixarNota,
    moverNotaParaPasta,
    duplicarNota,
    excluirNota,
    restaurarNota,
    excluirNotaPermanente,
  };
}

export function conteudoDaNota(nota: AssistantDocumento): string {
  return (nota.conteudo || "").slice(NOTA_PREFIX.length);
}
