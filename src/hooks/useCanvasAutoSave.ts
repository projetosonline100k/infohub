import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveCanvasSafely } from "@/lib/canvasPersistence";

export const canvasBackupKey = (id: string) => `canvas-pending:${id}`;

// Uma fila por instância: nenhuma gravação antiga termina depois de uma nova.
// A comparação no banco também protege contra outras abas/pessoas.
export function useCanvasAutoSave(documentoId: string) {
  const [status, setStatus] = useState({ saving: false, lastSaved: null as Date | null, error: "" });
  const queue = useMemo(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<boolean> | null = null;
    let mounted = true;
    const key = canvasBackupKey(documentoId);
    const report = (patch: Partial<typeof status>) => { if (mounted) setStatus(prev => ({ ...prev, ...patch })); };
    const backup = (content: string) => {
      try { localStorage.setItem(key, content); }
      catch { report({ error: "Não foi possível guardar a cópia local. Mantenha a lousa aberta até salvar." }); }
    };
    const flush = (): Promise<boolean> => {
      clearTimeout(timer);
      if (running) return running;
      if (pending === null) return Promise.resolve(true);
      running = (async () => {
        report({ saving: true });
        try {
          while (pending !== null) {
            const content = pending;
            await saveCanvasSafely(content, {
              read: async () => {
                const { data, error } = await supabase.from("documentos").select("conteudo, updated_at").eq("id", documentoId).single();
                if (error) throw error;
                return data;
              },
              compareAndSwap: async (version, merged) => {
                const { data, error } = await supabase.from("documentos").update({ conteudo: merged })
                  .eq("id", documentoId).eq("updated_at", version).select("id");
                if (error) throw error;
                return !!data?.length;
              },
            });
            if (pending === content) pending = null;
            try { if (localStorage.getItem(key) === content) localStorage.removeItem(key); } catch { /* Keep any backup on failure. */ }
            report({ lastSaved: new Date(), error: "" });
          }
          return true;
        } catch {
          report({ error: "Alterações pendentes. Verifique a conexão; tentaremos salvar novamente." });
          if (mounted) timer = setTimeout(() => void flush(), 5000);
          return false;
        } finally {
          running = null;
          report({ saving: false });
        }
      })();
      return running;
    };
    const enqueue = (content: string) => { pending = content; backup(content); clearTimeout(timer); };
    return {
      debouncedSave: (content: string) => { enqueue(content); timer = setTimeout(() => void flush(), 800); },
      saveNow: (content: string) => { enqueue(content); return flush(); },
      flush,
      hasPending: () => pending !== null || running !== null,
      mount: () => { mounted = true; },
      dispose: () => { mounted = false; clearTimeout(timer); void flush(); },
    };
  }, [documentoId]);

  useEffect(() => {
    queue.mount();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.hasPending()) { event.preventDefault(); event.returnValue = ""; }
    };
    const retry = () => { void queue.flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") retry(); };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisibility);
      queue.dispose();
    };
  }, [queue]);
  return { ...status, debouncedSave: queue.debouncedSave, saveNow: queue.saveNow };
}
