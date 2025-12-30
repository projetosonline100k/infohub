import { useState, useCallback, useRef, useEffect } from "react";
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
    const { error } = await supabase
      .from("documentos")
      .update({
        conteudo: content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentoId);

    if (!error) {
      setLastSaved(new Date());
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Save any pending content before unmount
        if (pendingContentRef.current !== null) {
          save(pendingContentRef.current);
        }
      }
    };
  }, [save]);

  return { saving, lastSaved, debouncedSave, saveNow: save };
}
