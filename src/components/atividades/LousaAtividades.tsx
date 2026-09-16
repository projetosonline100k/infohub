import { useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronUp, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MindMapEditor, createEmptyMindMapContent } from "@/components/documentos/MindMapEditor";
import { toast } from "sonner";

interface Props {
  clienteId?: string;
  pastaId: string | null;
  pastaNome?: string;
}

export function LousaAtividades({ clienteId, pastaId, pastaNome }: Props) {
  const [mapas, setMapas] = useState<{ id: string; titulo: string }[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [aberta, setAberta] = useState(true);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro(false);
    let query = supabase.from("documentos").select("id, titulo")
      .like("conteudo", "\\_\\_CANVASMENTAL\\_V1\\_\\_%").order("created_at");
    query = clienteId ? query.eq("cliente_id", clienteId) : query.is("cliente_id", null);
    query = pastaId ? query.eq("pasta_id", pastaId) : query.is("pasta_id", null);
    void query.then(({ data, error }) => {
      if (!ativo) return;
      setLoading(false);
      if (error) { setErro(true); return; }
      setMapas(data || []);
      setSelecionado(data?.[0]?.id || "");
    });
    return () => { ativo = false; };
  }, [clienteId, pastaId, tentativa]);

  const criar = async () => {
    if (criando) return;
    setCriando(true);
    const { data, error } = await supabase.from("documentos").insert({
      cliente_id: clienteId || null,
      pasta_id: pastaId,
      titulo: pastaNome ? `Lousa · ${pastaNome}` : "Lousa de atividades",
      conteudo: createEmptyMindMapContent(),
    }).select("id, titulo").single();
    setCriando(false);
    if (error) { toast.error("Não foi possível criar a lousa"); return; }
    setMapas(prev => [...prev, data]);
    setSelecionado(data.id);
    setAberta(true);
  };

  return <section className="mt-6 space-y-3 border-t border-border pt-5" aria-label="Lousa das atividades">
    <div className="flex flex-wrap items-center gap-3">
      <button className="flex items-center gap-2 font-semibold" onClick={() => setAberta(prev => !prev)} aria-expanded={aberta}>
        <Workflow className="h-5 w-5 text-primary" />Lousa
        {aberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {mapas.length > 0 && <select aria-label="Escolher lousa" className="max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm" value={selecionado}
        onChange={event => { setSelecionado(event.target.value); setAberta(true); }}>
        {mapas.map(mapa => <option key={mapa.id} value={mapa.id}>{mapa.titulo}</option>)}
      </select>}
      <Button size="sm" variant="outline" className="ml-auto" disabled={loading || criando || erro} onClick={() => void criar()}><Plus className="mr-1 h-4 w-4" />{criando ? "Criando..." : "Nova lousa"}</Button>
    </div>
    {aberta && (loading ? <p className="py-8 text-center text-muted-foreground">Carregando lousas...</p> : erro ?
      <div className="py-8 text-center"><p className="text-muted-foreground">Não foi possível carregar as lousas.</p><Button variant="ghost" onClick={() => setTentativa(prev => prev + 1)}>Tentar novamente</Button></div> :
      selecionado ? <MindMapEditor key={selecionado} documentoId={selecionado} embedded onClose={() => setAberta(false)} /> :
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground"><p>Organize suas ideias em uma lousa abaixo das tarefas.</p><Button className="mt-3" variant="outline" disabled={criando} onClick={() => void criar()}>Criar primeira lousa</Button></div>
    )}
  </section>;
}
