import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { completarCapas, processarFila } from "@/lib/creator/transcricaoStore";
import { separarIdeiasPendentes } from "@/lib/creator/separarIdeia";

// Liga a fila do iPhone (ver processarFila): ao abrir o Jarvis, quando um
// link novo chega (tempo real) e a cada minuto, por garantia.
// Também completa as capas das referências antigas (completarCapas).
export function useFilaCreator(userId: string | null | undefined, ativo: boolean) {
  useEffect(() => {
    if (!userId || !ativo) return;
    const rodar = () => { void processarFila(userId).then(() => separarIdeiasPendentes(userId)); };
    rodar();
    // Depois da fila, completa as capas que faltam (uma vez por abertura).
    const capas = setTimeout(() => { void completarCapas(userId); }, 20_000);
    const canal = supabase
      .channel(`creator-links-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "creator_links", filter: `user_id=eq.${userId}` }, rodar)
      .subscribe();
    const t = setInterval(rodar, 60_000);
    return () => { void supabase.removeChannel(canal); clearInterval(t); clearTimeout(capas); };
  }, [userId, ativo]);
}
