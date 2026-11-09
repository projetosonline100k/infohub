import { useEffect, useState } from "react";
import { BookOpen, FileText, StickyNote, Workflow } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { NOTA_PREFIX } from "@/hooks/useAssistantDocumentos";

// Janela de busca para escolher a que documento, nota ou desenho o link vai (usada pelo desenho e pelo editor
// de documentos). Busca pelo título; sem digitar, mostra os mais recentes.
interface Item { id: string; titulo: string | null; tipo: string | null; cliente_id: string | null; nota?: boolean }

const padrao = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function EscolherDocumento({ aberto, aoFechar, aoEscolher, excluirId }: {
  aberto: boolean; aoFechar: () => void; aoEscolher: (item: { id: string; titulo: string }) => void;
  /** o próprio documento (não faz sentido linkar para si) */
  excluirId?: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [projetos, setProjetos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { if (!aberto) setBusca(""); }, [aberto]);
  useEffect(() => {
    if (!aberto || Object.keys(projetos).length) return;
    void supabase.from("clientes").select("id, nome_especialista").then(({ data }) =>
      setProjetos(Object.fromEntries((data ?? []).map((c) => [c.id, c.nome_especialista]))));
  }, [aberto, projetos]);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregando(true);
    const t = window.setTimeout(async () => {
      const termo = busca.trim();
      let docs = supabase.from("documentos").select("id, titulo, tipo, cliente_id").is("deleted_at", null)
        .or(`conteudo.is.null,conteudo.not.like.${NOTA_PREFIX}*`).order("updated_at", { ascending: false }).limit(25);
      let notas = supabase.from("documentos").select("id, titulo, tipo, cliente_id").is("deleted_at", null)
        .like("conteudo", `${NOTA_PREFIX}%`).order("updated_at", { ascending: false }).limit(15);
      if (termo) { docs = docs.ilike("titulo", padrao(termo)); notas = notas.ilike("titulo", padrao(termo)); }
      const [d, n] = await Promise.all([docs, notas]);
      if (!vivo) return;
      const lista = [...((d.data ?? []) as Item[]), ...((n.data ?? []) as Item[]).map((x) => ({ ...x, nota: true }))].filter((x) => x.id !== excluirId);
      setItens(lista);
      setCarregando(false);
    }, 200);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [aberto, busca, excluirId]);

  return (
    <CommandDialog open={aberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogTitle className="sr-only">Linkar a um documento</DialogTitle>
      <DialogDescription className="sr-only">Escolha o documento, nota ou desenho para onde o link vai</DialogDescription>
      <CommandInput placeholder="Linkar a qual documento, nota ou desenho?" value={busca} onValueChange={setBusca} />
      <CommandList>
        <CommandEmpty>{carregando ? "Buscando..." : "Nada encontrado."}</CommandEmpty>
        <CommandGroup heading={busca.trim() ? "Resultados" : "Recentes"}>
          {itens.map((i) => {
            const Icone = i.nota ? StickyNote : i.tipo === "mapa" ? Workflow : i.tipo === "caderno" ? BookOpen : FileText;
            return (
              <CommandItem key={i.id} value={`${i.titulo ?? ""} ${i.id}`} keywords={[busca]} onSelect={() => { aoEscolher({ id: i.id, titulo: i.titulo || "Sem título" }); aoFechar(); }}>
                <Icone className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{i.titulo || "Sem título"}</span>
                <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
                  {i.nota ? "Nota" : i.tipo === "mapa" ? "Desenho" : "Documento"}{i.cliente_id && projetos[i.cliente_id] ? ` · ${projetos[i.cliente_id]}` : ""}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
