import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DocumentEditor } from "./DocumentEditor";
import { CadernoEditor, isCadernoContent } from "./CadernoEditor";
import { MindMapEditor, isMindMapContent } from "./MindMapEditor";

type QuickDoc = { id: string; titulo: string; conteudo: string | null };

export function DocumentQuickAccess({ clienteId }: { clienteId: string }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<QuickDoc[]>([]);
  const [selected, setSelected] = useState<QuickDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || open || selected) return;
      // Preserve edição, navegação de controles e foco de outros modais.
      if (target.closest('input, textarea, select, button, a, [data-document-canvas], [contenteditable="true"], [role="dialog"], [role="menu"], [role="combobox"]')) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(false);
    setDocs([]);
    void supabase.from("documentos").select("id, titulo, conteudo").eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false }).then(({ data, error }) => {
        if (!active) return;
        setDocs(data || []);
        setError(!!error);
        setLoading(false);
      });
    return () => { active = false; };
  }, [open, clienteId]);

  const close = () => setSelected(null);
  return <>
    <button className="mt-4 px-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>Acesso rápido · Tab</button>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">Abrir documento</DialogTitle>
      <DialogDescription className="sr-only">Busque e selecione um documento, caderno ou mapa mental.</DialogDescription>
      <CommandInput placeholder="Buscar documentos e mapas mentais..." />
      <CommandList>
        <CommandEmpty>{loading ? "Carregando..." : error ? "Não foi possível carregar os documentos. Feche e tente novamente." : "Nenhum documento encontrado."}</CommandEmpty>
        {docs.map(doc => <CommandItem key={doc.id} value={`${doc.titulo} ${doc.id}`} onSelect={() => { setOpen(false); setSelected(doc); }}>
          <FileText className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{doc.titulo}</span>
          <span className="ml-auto pl-2 text-xs text-muted-foreground">{isMindMapContent(doc.conteudo) ? "Mapa mental" : isCadernoContent(doc.conteudo) ? "Caderno" : "Documento"}</span>
        </CommandItem>)}
      </CommandList>
    </CommandDialog>
    {selected && (isMindMapContent(selected.conteudo) ? <MindMapEditor documentoId={selected.id} onClose={close} /> : isCadernoContent(selected.conteudo) ? <CadernoEditor documentoId={selected.id} onClose={close} /> : <DocumentEditor documentoId={selected.id} onClose={close} />)}
  </>;
}
