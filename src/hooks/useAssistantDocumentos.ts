import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { aplicarPendentes, guardarNoCache, ligarSincronizacao, notasDoCache, novoId, salvarNota, type LinhaNota } from "@/lib/notas/localPrimeiro";

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

// Nota aberta no editor de Documentos era salva com o prefixo virando um
// parágrafo de texto ("<p>__NOTA_RAPIDA_V1__</p>...") — e sumia das Notas.
const NOTA_PREFIX_CORROMPIDO = `<p>${NOTA_PREFIX}</p>`;

export function ehNota(conteudo: string | null | undefined): boolean {
  return !!conteudo && (conteudo.startsWith(NOTA_PREFIX) || conteudo.startsWith(NOTA_PREFIX_CORROMPIDO));
}

// Devolve o conteúdo com o prefixo de nota no lugar certo (ou null se já está ok).
function reparoDeNota(conteudo: string | null): string | null {
  if (!conteudo?.startsWith(NOTA_PREFIX_CORROMPIDO)) return null;
  return NOTA_PREFIX + conteudo.slice(NOTA_PREFIX_CORROMPIDO.length);
}

function ehDocumentoComum(conteudo: string | null): boolean {
  if (!conteudo) return true;
  return !conteudo.startsWith(CADERNO_PREFIX) && !conteudo.startsWith(CANVAS_PREFIX) && !ehNota(conteudo);
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
    // Local primeiro (20/10, "igual o Notas do iPhone"): mostra na hora a cópia do Mac e
    // atualiza com a nuvem por trás. Sem cópia ainda, mostra "carregando" como antes.
    ligarSincronizacao();
    const doMac = notasDoCache(clienteId);
    if (doMac.length) {
      setNotas(doMac.filter((d) => !d.deleted_at));
      setNotasLixeira(doMac.filter((d) => d.deleted_at));
    } else setLoading(true);
    const { data, error } = await supabase
      .from("documentos")
      .select(SELECT_FIELDS)
      .eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false });
    if (!error) {
      // Recupera notas que perderam o prefixo (ver NOTA_PREFIX_CORROMPIDO):
      // corrige aqui pra já aparecerem e grava a correção no banco.
      const todos = (data || []).map((d) => {
        const reparado = reparoDeNota(d.conteudo);
        if (!reparado) return d;
        void supabase.from("documentos").update({ conteudo: reparado }).eq("id", d.id).then(({ error: erroReparo }) => {
          if (erroReparo) console.error("Erro ao recuperar nota:", erroReparo);
        });
        return { ...d, conteudo: reparado };
      });
      setDocumentos(todos.filter((d) => !d.deleted_at && ehDocumentoComum(d.conteudo)));
      // O que foi escrito no Mac e ainda não subiu vence a versão da nuvem.
      const daNuvem = aplicarPendentes(todos.filter((d) => d.conteudo?.startsWith(NOTA_PREFIX)) as LinhaNota[], clienteId);
      guardarNoCache(clienteId, daNuvem);
      setNotas(daNuvem.filter((d) => !d.deleted_at));
      setNotasLixeira(daNuvem.filter((d) => d.deleted_at));
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

  // Nota nova nasce no Mac (id gerado aqui) e sobe por trás — abre na hora, mesmo sem internet.
  const criarNota = useCallback(async (titulo: string, conteudo: string, pastaId: string | null = null) => {
    const agora = new Date().toISOString();
    const nova: AssistantDocumento = {
      id: novoId(), cliente_id: clienteId, titulo: titulo || "Nota sem título", conteudo: NOTA_PREFIX + conteudo,
      pasta_id: pastaId, fixado: false, deleted_at: null, created_at: agora, updated_at: agora,
    };
    setNotas((prev) => [nova, ...prev]);
    void salvarNota(nova as LinhaNota);
    return nova;
  }, [clienteId]);

  // Mudança numa nota (fixar, mover, lixeira): guarda no Mac e sobe por trás.
  const mudarNota = useCallback((nota: AssistantDocumento | undefined, patch: Partial<AssistantDocumento>) => {
    if (!nota) return;
    void salvarNota({ ...nota, ...patch, updated_at: new Date().toISOString() } as LinhaNota);
  }, []);

  // Fixar/desafixar (item 9) — mesma tabela, só a coluna nova.
  const fixarNota = useCallback(async (id: string, fixado: boolean) => {
    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, fixado } : n)));
    mudarNota(notas.find((n) => n.id === id), { fixado });
  }, [mudarNota, notas]);

  const moverNotaParaPasta = useCallback(async (id: string, pastaId: string | null) => {
    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, pasta_id: pastaId } : n)));
    mudarNota(notas.find((n) => n.id === id), { pasta_id: pastaId });
  }, [mudarNota, notas]);

  // Corrige a nota já em memória sem ir ao banco — usado pelo autosave do
  // editor (useNotaEditor), que grava direto no Supabase por fora deste
  // hook. Sem isto, o array `notas` ficava com o conteúdo antigo depois de
  // qualquer edição: reabrir a nota (o editor é remontado do zero no Atlas,
  // e reselecionada troca o `nota.id` na página /notas) recarregava o texto
  // ANTIGO a partir daqui, dando a impressão de que nada tinha sido salvo —
  // quando na real só este cache local é que nunca era atualizado.
  const atualizarNotaLocal = useCallback((id: string, patch: Partial<AssistantDocumento>) => {
    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  // A cópia do Mac acompanha o que está na tela (notas + lixeira).
  useEffect(() => {
    if (clienteId && (notas.length || notasLixeira.length)) guardarNoCache(clienteId, [...notas, ...notasLixeira] as LinhaNota[]);
  }, [clienteId, notas, notasLixeira]);

  const duplicarNota = useCallback(async (id: string) => {
    const original = notas.find((n) => n.id === id);
    if (!original) return;
    const agora = new Date().toISOString();
    const copia: AssistantDocumento = { ...original, id: novoId(), titulo: `${original.titulo} (cópia)`, fixado: false, created_at: agora, updated_at: agora };
    setNotas((prev) => [copia, ...prev]);
    void salvarNota(copia as LinhaNota);
    return copia;
  }, [notas]);

  // "Excluir" move pra lixeira (soft-delete, item 2) — não apaga de
  // verdade. Excluir de vez é uma ação separada, só disponível dentro da
  // própria Lixeira.
  const excluirNota = useCallback(async (id: string) => {
    const agora = new Date().toISOString();
    const nota = notas.find((n) => n.id === id);
    setNotas((prev) => prev.filter((n) => n.id !== id));
    if (nota) setNotasLixeira((prev) => [{ ...nota, deleted_at: agora }, ...prev]);
    mudarNota(nota, { deleted_at: agora });
  }, [mudarNota, notas]);

  const restaurarNota = useCallback(async (id: string) => {
    const nota = notasLixeira.find((n) => n.id === id);
    setNotasLixeira((prev) => prev.filter((n) => n.id !== id));
    if (nota) setNotas((prev) => [{ ...nota, deleted_at: null }, ...prev]);
    mudarNota(nota, { deleted_at: null });
  }, [mudarNota, notasLixeira]);

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
    atualizarNotaLocal,
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
