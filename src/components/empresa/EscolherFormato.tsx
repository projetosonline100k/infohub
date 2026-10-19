import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EdicaoResumo } from "./EditorVideo";

const db = supabase as unknown as SupabaseClient;   // formato/opcoes_formato ainda fora dos tipos gerados

// Antes de editar, o Danilo pergunta o formato (pedido do Davi, 18/10): duas
// imagens feitas com um quadro do próprio bruto. A escolha volta pra fila e o
// serviço do Danilo no Mac edita naquele formato.
const OPCOES = [
  { chave: "classico", nome: "Clássico", detalhe: "Pinturas e legendas, como vínhamos fazendo" },
  { chave: "papel", nome: "Papel animado", detalhe: "Tela dividida: desenhos à mão em cima, você embaixo" },
] as const;

export function EscolherFormato({ edicao, onFechar }: { edicao: EdicaoResumo | null; onFechar: (escolheu: boolean) => void }) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const escolher = async (formato: string) => {
    if (!edicao) return;
    setSalvando(formato);
    const { error } = await db.from("edicoes_video").update({ formato, status: "na_fila", mensagem: "Na fila do Danilo" }).eq("id", edicao.id);
    setSalvando(null);
    if (error) { toast.error("Não consegui salvar a escolha"); return; }
    toast.success(`Formato ${formato === "papel" ? "papel animado" : "clássico"}: o Danilo começa a editar`);
    onFechar(true);
  };
  return (
    <Dialog open={!!edicao} onOpenChange={(a) => { if (!a) onFechar(false); }}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="text-base">Qual formato para "{edicao?.titulo}"?</DialogTitle>
        <p className="-mt-1 text-sm text-muted-foreground">O Danilo montou as duas opções com um quadro do seu vídeo. Clique na que você quer.</p>
        <div className="grid grid-cols-2 gap-4">
          {OPCOES.map((o) => {
            const img = edicao?.opcoes_formato?.[o.chave];
            return (
              <button key={o.chave} type="button" disabled={!!salvando} onClick={() => void escolher(o.chave)}
                className={cn("group flex flex-col items-center gap-2 rounded-xl border p-3 text-left transition hover:border-primary hover:bg-muted/50",
                  salvando === o.chave && "border-primary")}>
                {img ? <img src={img} alt={o.nome} className="aspect-[9/16] w-full max-w-[260px] rounded-lg object-cover shadow" />
                  : <div className="flex aspect-[9/16] w-full max-w-[260px] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">sem prévia</div>}
                <div className="w-full max-w-[260px]">
                  <div className="flex items-center gap-1.5 font-semibold">{salvando === o.chave && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{o.nome}</div>
                  <div className="text-xs text-muted-foreground">{o.detalhe}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
