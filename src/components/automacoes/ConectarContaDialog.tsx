import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gerarLinkConexao } from "@/hooks/useInstagramAutomacoes";

type Cliente = { id: string; nome_especialista: string };

// Conectar uma conta do Instagram (sua ou de um cliente) por link: a pessoa
// abre, entra no Instagram dela e autoriza; o token nunca passa por aqui.
// Enquanto o app da Meta não tem aprovação, a conta precisa antes aceitar o
// convite de "Instagram Tester" (docs/INSTAGRAM_AUTOMACOES.md).
export function ConectarContaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [link, setLink] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setLink(null);
    setCopiado(false);
    supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setClientes(data ?? []));
  }, [aberto]);

  const nome = clientes.find((c) => c.id === clienteId)?.nome_especialista;
  const mensagem = link && (nome
    ? `Oi, ${nome.split(" ")[0]}! Para ligar as automações de DM no seu Instagram:\n\n` +
      `1. No Instagram: Configurações → Apps e sites → Convites do testador → aceite o "Infopro Hub Automacoes".\n` +
      `2. Depois abra este link, entre no seu Instagram e toque em Permitir:\n${link}\n\nO link vale 7 dias.`
    : link);

  const gerar = async () => {
    setGerando(true);
    try {
      setLink(await gerarLinkConexao(clienteId || null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para gerar o link");
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!mensagem) return;
    await navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    toast.success("Copiado");
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar conta do Instagram</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conta-cliente">De quem é a conta?</Label>
            <select id="conta-cliente" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setLink(null); }}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Meu perfil</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome_especialista}</option>)}
            </select>
          </div>

          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Convide o @ como <strong className="text-foreground">Instagram Tester</strong> no app da Meta (ou peça ao Claude).</li>
            <li>A pessoa aceita em Instagram → Configurações → Apps e sites → Convites do testador.</li>
            <li>A pessoa abre o link abaixo e toca em <strong className="text-foreground">Permitir</strong>. Pronto: a conta aparece aqui.</li>
          </ol>

          {!link ? (
            <Button onClick={gerar} disabled={gerando} className="w-full">
              {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar link de conexão
            </Button>
          ) : (
            <div className="space-y-2">
              <Label>{nome ? "Mensagem pronta para mandar" : "Abra este link e autorize"}</Label>
              <Textarea readOnly rows={nome ? 8 : 3} value={mensagem ?? ""} className="text-xs" />
              <div className="flex gap-2">
                <Button onClick={copiar} className="flex-1">
                  {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} Copiar
                </Button>
                {!nome && <Button variant="outline" onClick={() => window.open(link, "_blank")}>Abrir</Button>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
