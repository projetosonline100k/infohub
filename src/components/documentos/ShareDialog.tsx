import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link as LinkIcon, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { documentShareUrl, publicWebOrigin, PUBLIC_SITE_URL } from "@/lib/shareUrl";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentoId: string;
  documentoTitulo: string;
  pastaId: string | null;
  onTituloChange: (titulo: string) => void;
}

type Modo = "documento" | "pasta";

interface Compartilhamento {
  id: string;
  token: string;
}

// Gera (ou reaproveita) um link público. Quem abre o link precisa criar
// conta ou entrar pra ver — a partir daí enxerga só este documento, ou,
// no modo pasta, todas as guias dela.
export function ShareDialog({ open, onOpenChange, documentoId, documentoTitulo, pastaId, onTituloChange }: ShareDialogProps) {
  const [modo, setModo] = useState<Modo>("documento");
  const [carregando, setCarregando] = useState(false);
  const [compartilhamento, setCompartilhamento] = useState<Compartilhamento | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [nome, setNome] = useState(documentoTitulo);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [nomePasta, setNomePasta] = useState("");
  const buscaAtual = useRef(0);
  const origin = publicWebOrigin(import.meta.env.VITE_SITE_URL?.trim() || PUBLIC_SITE_URL, window.location.origin);

  useEffect(() => { setNome(documentoTitulo); }, [documentoTitulo, open]);

  useEffect(() => {
    let ativo = true;
    setNomePasta("");
    if (open && pastaId) {
      supabase.from("pastas_atividade").select("nome").eq("id", pastaId).maybeSingle().then(({ data }) => {
        if (ativo) setNomePasta(data?.nome || "Pasta");
      });
    }
    return () => { ativo = false; };
  }, [open, pastaId]);

  const salvarNome = async () => {
    const titulo = nome.trim();
    if (!titulo) return;
    setSalvandoNome(true);
    const { error } = await supabase.from("documentos").update({ titulo }).eq("id", documentoId);
    setSalvandoNome(false);
    if (error) { toast.error("Não foi possível salvar o nome"); return; }
    onTituloChange(titulo);
    setNome(titulo);
    toast.success("Nome salvo");
  };

  useEffect(() => {
    if (!open) return;
    setModo("documento");
    setCopiado(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    buscarExistente(modo);
    return () => { buscaAtual.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modo, documentoId, pastaId]);

  const buscarExistente = async (m: Modo) => {
    const busca = ++buscaAtual.current;
    setCompartilhamento(null);
    setCopiado(false);
    if (m === "pasta" && !pastaId) return;
    setCarregando(true);
    const query = supabase.from("compartilhamentos").select("id, token").eq("tipo", m);
    const { data, error } = m === "documento"
      ? await query.eq("documento_id", documentoId).maybeSingle()
      : await query.eq("pasta_id", pastaId as string).maybeSingle();
    if (busca !== buscaAtual.current) return;
    if (!error && data) setCompartilhamento(data);
    setCarregando(false);
  };

  const gerarLink = async () => {
    setCarregando(true);
    const payload = modo === "documento"
      ? { tipo: "documento", documento_id: documentoId }
      : { tipo: "pasta", pasta_id: pastaId };
    const { data, error } = await supabase.from("compartilhamentos").insert(payload).select("id, token").single();
    setCarregando(false);
    if (error || !data) {
      toast.error("Não foi possível gerar o link");
      return;
    }
    setCompartilhamento(data);
  };

  const pararCompartilhar = async () => {
    if (!compartilhamento) return;
    if (!window.confirm("Quem já tem o link perde o acesso imediatamente. Continuar?")) return;
    setCarregando(true);
    const { error } = await supabase.from("compartilhamentos").delete().eq("id", compartilhamento.id);
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível parar o compartilhamento");
      return;
    }
    setCompartilhamento(null);
    toast.success("Compartilhamento encerrado");
  };

  const link = compartilhamento && origin ? documentShareUrl(origin, compartilhamento.token, modo === "documento" ? documentoTitulo : nomePasta) : "";

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o link e copie com Ctrl+C ou ⌘C.");
      return;
    }
    setCopiado(true);
    toast.success("Link copiado");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar</DialogTitle>
        </DialogHeader>

        <Tabs value={modo} onValueChange={(v) => { setCompartilhamento(null); setModo(v as Modo); }}>
          <TabsList className="w-full">
            <TabsTrigger value="documento" className="flex-1" disabled={carregando}>
              Este documento
            </TabsTrigger>
            <TabsTrigger value="pasta" className="flex-1" disabled={!pastaId || carregando}>
              A pasta inteira
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {modo === "documento" && (
          <div className="space-y-2">
            <Label htmlFor="share-document-name">Nome do documento</Label>
            <div className="flex gap-2">
              <Input id="share-document-name" value={nome} onChange={(e) => setNome(e.target.value)} />
              <Button variant="outline" onClick={salvarNome} disabled={salvandoNome || !nome.trim() || nome.trim() === documentoTitulo}>
                {salvandoNome ? "Salvando…" : "Salvar nome"}
              </Button>
            </div>
          </div>
        )}

        {!origin && <p role="alert" className="text-sm text-destructive">O endereço público do site ainda não foi configurado neste app. O compartilhamento ficará disponível após essa configuração.</p>}

        <p className="text-sm text-muted-foreground">
          {modo === "documento"
            ? `Quem abrir o link vê só "${documentoTitulo || "este documento"}".`
            : pastaId
              ? "Quem abrir o link vê todas as guias desta pasta."
              : "Escolha uma pasta para este documento antes de compartilhá-la."}
        </p>

        {carregando ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : compartilhamento ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input readOnly value={link} className="pl-8 text-sm" onFocus={(e) => e.currentTarget.select()} />
              </div>
              <Button type="button" size="icon" variant="outline" onClick={copiar} disabled={!link} aria-label="Copiar link">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A pessoa precisa criar uma conta (ou entrar, se já tiver uma) pra acessar. Contas novas aparecem para
              você no painel de Administração.
            </p>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={pararCompartilhar}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Parar de compartilhar
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={gerarLink} disabled={!origin || (modo === "pasta" && !pastaId)} className="w-full">
            Gerar link de compartilhamento
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
