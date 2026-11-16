import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink, Loader2, MessageSquareText, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { gerarLinkConexao } from "@/hooks/useInstagramAutomacoes";
import { abrirLinkExterno } from "@/lib/abrirLink";

type Cliente = { id: string; nome_especialista: string };

// Conectar uma conta do Instagram (sua ou de um cliente) por link, igual ao do perfil dark do Lauro (16/11/2026, Davi: "gera um link que eu só copio, abro e aceito"):
// gera o link, copia ou abre, autoriza no Instagram e esta janela fecha sozinha quando a conta aparece. O token nunca passa por aqui.
export function ConectarContaDialog({ aberto, onFechar, contasIds = [], recarregar }: {
  aberto: boolean; onFechar: () => void;
  contasIds?: string[];                  // contas já conectadas: quando aparece uma nova, a janela fecha
  recarregar?: () => Promise<unknown> | void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [verQr, setVerQr] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState<"link" | "mensagem" | null>(null);
  const base = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!aberto) return;
    setLink(null); setQr(""); setVerQr(false); setCopiado(null);
    supabase.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setClientes(data ?? []));
  }, [aberto]);

  // Enquanto espera a autorização, olha as contas a cada 4 s; apareceu uma nova, fecha.
  useEffect(() => {
    if (!aberto || !link || !recarregar) return;
    const t = window.setInterval(() => void recarregar(), 4000);
    return () => window.clearInterval(t);
  }, [aberto, link, recarregar]);
  useEffect(() => {
    if (!aberto || !link) return;
    if (contasIds.some((id) => !base.current.has(id))) { toast.success("Conta conectada!"); onFechar(); }
  }, [contasIds, aberto, link, onFechar]);

  const nome = clientes.find((c) => c.id === clienteId)?.nome_especialista;
  const mensagem = link && nome
    ? `Oi, ${nome.split(" ")[0]}! Para ligar as automações de DM no seu Instagram, abra este link, entre no seu Instagram e toque em Permitir:\n${link}\n\nO link vale 7 dias.`
    : link;

  const gerar = async () => {
    setGerando(true);
    try {
      base.current = new Set(contasIds);
      const url = await gerarLinkConexao(clienteId || null);
      setLink(url);
      setQr(await QRCode.toDataURL(url, { width: 320, margin: 2 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para gerar o link");
    } finally {
      setGerando(false);
    }
  };
  const copiar = async (o: "link" | "mensagem") => {
    const texto = o === "link" ? link : mensagem;
    if (!texto) return;
    try { await navigator.clipboard.writeText(texto); setCopiado(o); toast.success(o === "link" ? "Link copiado" : "Mensagem copiada"); }
    catch { toast.error("Não consegui copiar: selecione o link e copie à mão"); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar conta do Instagram</DialogTitle>
          <DialogDescription>Gere o link, abra e toque em Permitir no Instagram da conta. Esta janela fecha sozinha quando ela conectar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conta-cliente">De quem é a conta?</Label>
            <select id="conta-cliente" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setLink(null); setQr(""); setVerQr(false); }}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Meu perfil</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome_especialista}</option>)}
            </select>
          </div>

          {!link ? (
            <Button onClick={() => void gerar()} disabled={gerando} className="w-full">
              {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar link de conexão
            </Button>
          ) : (
            <div className="space-y-3">
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void copiar("link")}>{copiado === "link" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} Copiar link</Button>
                <Button variant="outline" onClick={() => void abrirLinkExterno(link)}><ExternalLink className="mr-2 h-4 w-4" /> Abrir neste computador</Button>
                <Button variant="outline" onClick={() => setVerQr((v) => !v)}><QrCode className="mr-2 h-4 w-4" /> {verQr ? "Esconder QR" : "Ver QR (celular)"}</Button>
                {nome && <Button variant="outline" onClick={() => void copiar("mensagem")}>{copiado === "mensagem" ? <Check className="mr-2 h-4 w-4" /> : <MessageSquareText className="mr-2 h-4 w-4" />} Mensagem pronta</Button>}
              </div>
              {verQr && qr && <img src={qr} alt="QR code para conectar o Instagram" className="mx-auto h-56 w-56 rounded-lg bg-white" />}
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Esperando você autorizar… o link vale 7 dias. Se for só reconectar uma conta que já está aqui, é só fechar esta janela depois.</p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Deu erro de permissão? Enquanto o app da Meta não é aprovado, a conta precisa aceitar antes o convite de “Instagram Tester” (Instagram → Configurações → Apps e sites → Convites do testador).</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
