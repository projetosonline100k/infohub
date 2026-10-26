import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  // Vai até o pé da janela (26/10, Davi: "tire essa parte de baixo, está ocupando espaço"): a altura é o que
  // sobra abaixo do topo da caixa, em vez de um valor fixo que deixava uma faixa vazia embaixo.
  const caixa = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const el = caixa.current;
      // Guia escondida (outra aba aberta) mede errado: espera ela aparecer.
      if (el && el.offsetParent) setAltura(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - 12));
    };
    medir();
    window.addEventListener("resize", medir);
    const visivel = new IntersectionObserver(medir);
    if (caixa.current) visivel.observe(caixa.current);
    return () => { window.removeEventListener("resize", medir); visivel.disconnect(); };
  }, [conta]);
  if (!conta) return null;
  return (
    <div ref={caixa} style={altura ? { height: altura } : undefined}
      className="h-[calc(100vh-170px)] min-h-[480px] overflow-hidden rounded-xl border bg-card pt-2">
      <AssistantWhatsappTab key={conta} conta={conta} tela />
    </div>
  );
}
