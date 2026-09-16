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
  const pendingContentRef = useRef<string | null>(null);

  const save = useCallback(async (content: string) => {
    if (!documentoId) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("documentos")
      .update({
        conteudo: content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentoId)
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

  const debouncedSave = useCallback((content: string) => {
    pendingContentRef.current = content;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (pendingContentRef.current !== null) {
        save(pendingContentRef.current);
        pendingContentRef.current = null;
      }
    }, debounceMs);
  }, [save, debounceMs]);

  // Salva na hora e cancela o debounce pendente. Crucial ao trocar de guia:
  // sem isso, o conteúdo do documento ANTERIOR ficava esquecido em
  // pendingContentRef e, ao trocar de novo, esse cleanup abaixo (disparado
  // pela troca de "save" quando o documentoId muda) reenviava o texto do
  // documento antigo por cima do documento novo.
  const saveNow = useCallback((content: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingContentRef.current = null;
    return save(content);
  }, [save]);

  // Cleanup on unmount (ou ao trocar de documento, já que "save" muda de
  // identidade com o documentoId): só reenvia se sobrou algo pendente de
  // fato — saveNow já limpa isso antes de trocar.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Save any pending content before unmount
        if (pendingContentRef.current !== null) {
          save(pendingContentRef.current);
          pendingContentRef.current = null;
        }
      }
    };
  }, [save]);

  return { saving, lastSaved, debouncedSave, saveNow };
}
