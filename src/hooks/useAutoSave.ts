import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UseAutoSaveOptions {
  documentoId: string;
  debounceMs?: number;
}

export function useAutoSave({ documentoId, debounceMs = 1000 }: UseAutoSaveOptions) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 24/10 (Davi: "fico clicando em outros documentos e acesso a info dos outros"): o salvamento leva o id do
  // documento que estava na tela quando o texto foi escrito. Antes, um salvamento atrasado ia para o
  // documento selecionado "agora" e gravava o texto de um documento por cima do outro.
  const pendingContentRef = useRef<{ content: string; id: string } | null>(null);

  const save = useCallback(async (content: string, id: string = documentoId) => {
    if (!id) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("documentos")
      .update({
        conteudo: content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      // O editor de texto não pode sobrescrever uma lousa/caderno aberto
      // por uma guia antiga ou um link de compartilhamento de pasta.
      .or("conteudo.is.null,and(conteudo.not.like.__CANVASMENTAL_V1__%,conteudo.not.like.__CADERNO_V1__%)")
      .select("id");

    if (!error && data?.length) {
      setLastSaved(new Date());
    } else {
      toast.error("Não foi possível salvar este texto. Abra mapas e cadernos pelo editor correspondente em Documentos.");
    }
    setSaving(false);
  }, [documentoId]);

  const debouncedSave = useCallback((content: string, id: string = documentoId) => {
    // Mudou de documento com um salvamento pendente: o do anterior vai na hora, para o documento dele.
    const pendente = pendingContentRef.current;
    if (pendente && pendente.id !== id) void save(pendente.content, pendente.id);
    pendingContentRef.current = { content, id };

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const p = pendingContentRef.current;
      if (p !== null) {
        save(p.content, p.id);
        pendingContentRef.current = null;
      }
    }, debounceMs);
  }, [save, debounceMs, documentoId]);

  // Salva na hora e cancela o debounce pendente. Crucial ao trocar de guia:
  // sem isso, o conteúdo do documento ANTERIOR ficava esquecido em
  // pendingContentRef e, ao trocar de novo, esse cleanup abaixo (disparado
  // pela troca de "save" quando o documentoId muda) reenviava o texto do
  // documento antigo por cima do documento novo.
  const saveNow = useCallback((content: string, id: string = documentoId) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingContentRef.current = null;
    return save(content, id);
  }, [save, documentoId]);

  // Cleanup on unmount (ou ao trocar de documento, já que "save" muda de
  // identidade com o documentoId): só reenvia se sobrou algo pendente de
  // fato — saveNow já limpa isso antes de trocar.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Save any pending content before unmount
        const p = pendingContentRef.current;
        if (p !== null) {
          save(p.content, p.id);
          pendingContentRef.current = null;
        }
      }
    };
  }, [save]);

  return { saving, lastSaved, debouncedSave, saveNow };
}
