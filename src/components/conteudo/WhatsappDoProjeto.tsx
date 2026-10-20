import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AssistantWhatsappTab } from "@/components/assistant/tabs/AssistantWhatsappTab";

// Guia "WhatsApp" do projeto (20/10, Davi): o número daquele projeto (clientes.whatsapp_conta;
// sem número próprio, o principal da Core/CS), igual ao que abre pela Shirley ou ⌘⌥W.
export function WhatsappDoProjeto({ clienteId }: { clienteId: string }) {
  const [conta, setConta] = useState<string | null>(null);
  useEffect(() => {
    void (supabase as unknown as SupabaseClient).from("clientes").select("whatsapp_conta").eq("id", clienteId).maybeSingle()
      .then(({ data }) => setConta((data as { whatsapp_conta?: string | null } | null)?.whatsapp_conta || "principal"));
  }, [clienteId]);
  if (!conta) return null;
  return (
    <div className="h-[calc(100vh-170px)] min-h-[480px] overflow-hidden rounded-xl border bg-card pt-2">
      <AssistantWhatsappTab key={conta} conta={conta} tela />
    </div>
  );
}
