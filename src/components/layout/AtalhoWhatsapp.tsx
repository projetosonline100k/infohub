import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AssistantWhatsappTab } from "@/components/assistant/tabs/AssistantWhatsappTab";
import { onAbrirWhatsapp } from "@/lib/desktop/events";

// ⌘⌥W abre o WhatsApp do projeto em que o Davi está (20/10/2026: "vai abrir quando eu clicar na Shirley
// ou caso eu aperte comando + option + W"). No Davi Queiroz é o número pessoal; fora de projeto, o principal.
export function AtalhoWhatsapp({ clienteId }: { clienteId?: string }) {
  const [aberto, setAberto] = useState(false);
  const [conta, setConta] = useState("principal");
  const [forcarPrincipal, setForcarPrincipal] = useState(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.altKey || e.shiftKey || e.ctrlKey || e.code !== "KeyW") return;
      e.preventDefault();
      e.stopPropagation();
      setAberto((a) => !a);
    };
    window.addEventListener("keydown", tecla, true);
    // Clique no aviso de WhatsApp do Atlas: abre aqui, no número dos clientes, já na conversa.
    let desligar = () => {};
    void onAbrirWhatsapp(() => { setForcarPrincipal(true); setAberto(false); setTimeout(() => setAberto(true), 0); }).then((f) => { desligar = f; });
    return () => { window.removeEventListener("keydown", tecla, true); desligar(); };
  }, []);
  useEffect(() => {
    if (!aberto) { setForcarPrincipal(false); return; }
    if (!clienteId || forcarPrincipal) { setConta("principal"); return; }
    void (supabase as unknown as SupabaseClient).from("clientes").select("whatsapp_conta").eq("id", clienteId).maybeSingle()
      .then(({ data }) => setConta((data as { whatsapp_conta?: string | null } | null)?.whatsapp_conta || "principal"));
  }, [aberto, clienteId, forcarPrincipal]);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="flex h-[94vh] max-h-[94vh] w-[97vw] max-w-[97vw] flex-col">
        <DialogTitle className="text-sm">{conta === "principal" ? "WhatsApp dos clientes" : "Seu WhatsApp pessoal"}</DialogTitle>
        <DialogDescription className="sr-only">Conversas do WhatsApp (⌘⌥W abre e fecha)</DialogDescription>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card pt-2">
          <AssistantWhatsappTab key={conta} conta={conta} tela />
        </div>
      </DialogContent>
    </Dialog>
  );
}
