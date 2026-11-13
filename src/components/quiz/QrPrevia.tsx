import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// QR code do link de prévia do quiz (gerado aqui no navegador: o link secreto não sai para nenhum serviço).
export function QrPrevia({ link, aberto, onFechar }: { link: string; aberto: boolean; onFechar: () => void }) {
  const [imagem, setImagem] = useState("");
  useEffect(() => { if (aberto) void QRCode.toDataURL(link, { width: 320, margin: 2 }).then(setImagem); }, [aberto, link]);
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link de prévia</DialogTitle>
          <DialogDescription>Aponte a câmera do celular. Mostra sempre o rascunho, sem publicar, e não conta nas métricas. O link já foi copiado.</DialogDescription>
        </DialogHeader>
        {imagem && <img src={imagem} alt="QR code do link de prévia" className="mx-auto h-64 w-64 rounded-lg bg-white" />}
        <p className="break-all text-center text-[11px] text-muted-foreground">{link}</p>
      </DialogContent>
    </Dialog>
  );
}
