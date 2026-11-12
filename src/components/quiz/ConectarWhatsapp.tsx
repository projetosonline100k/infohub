import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Reconectar o WhatsApp do projeto sem sair do app (12/11/2026, Davi: "coloque o QR code no sistema para eu escanear direto").
// Religa a sessão se ela caiu e mostra o QR; ao escanear (WhatsApp > Aparelhos conectados > Conectar um aparelho), fecha sozinho.
type Conexao = { status: string; nome?: string | null; numero?: string | null };

export function ConectarWhatsapp({ aberto, conta, onFechar, onConectado }: { aberto: boolean; conta: string; onFechar: () => void; onConectado?: () => void }) {
  const [estado, setEstado] = useState<Conexao | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    let ultimoQr = 0;
    setEstado(null); setQr(null); setErro(null);
    const ciclo = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const c = await invoke<Conexao>("whatsapp_conexao", { conta });
        if (!vivo) return;
        setEstado(c); setErro(null);
        if (c.status === "WORKING") { vivo = false; window.clearInterval(t); onConectado?.(); return; }
        if (c.status === "SCAN_QR_CODE" && Date.now() - ultimoQr > 15000) {
          ultimoQr = Date.now();
          const q = await invoke<{ mimetype?: string; data?: string }>("whatsapp_qr", { conta });
          if (vivo && q?.data) setQr(`data:${q.mimetype || "image/png"};base64,${q.data}`);
        }
      } catch (e) { if (vivo) setErro(typeof e === "string" ? e : "Não consegui falar com o WhatsApp do Mac."); }
    };
    const t = window.setInterval(() => void ciclo(), 3000);
    void ciclo();
    return () => { vivo = false; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, conta]);

  const ok = estado?.status === "WORKING";
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar o WhatsApp</DialogTitle>
          <DialogDescription>No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para o QR abaixo.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center text-sm">
          {ok ? (
            <><CheckCircle2 className="h-12 w-12 text-emerald-500" /><p className="font-medium">Conectado{estado?.nome ? ` como ${estado.nome}` : ""}.</p>
              <button type="button" onClick={onFechar} className="rounded-lg bg-primary px-4 py-1.5 text-primary-foreground">Fechar</button></>
          ) : qr ? (
            <><img src={qr} alt="QR code do WhatsApp" className="h-60 w-60 rounded-lg bg-white p-2" /><p className="text-xs text-muted-foreground">O código se renova sozinho. Esta tela fecha quando conectar.</p></>
          ) : erro ? <p className="text-destructive">{erro}</p>
          : <><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><p className="text-muted-foreground">{estado ? `Preparando a conexão (${estado.status})…` : "Verificando o WhatsApp…"}</p></>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
