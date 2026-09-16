import { useState, useEffect } from "react";
import { FileText, Plus, Search, Trash2, Link as LinkIcon, Workflow, BookOpen, FolderPlus, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./DocumentEditor";
import { CadernoEditor, createEmptyCadernoContent, isCadernoContent } from "./CadernoEditor";
import { MindMapEditor, createEmptyMindMapContent, isMindMapContent } from "./MindMapEditor";
import { toast } from "sonner";

interface Documento {
  id: string;
  titulo: string;
  conteudo: string | null;
  created_at: string;
  updated_at: string;
  atividade_id: string | null;
  pasta_id: string | null;
}

interface Atividade {
  id: string;
  titulo: string;
}

interface DocumentosViewProps {
  clienteId: string;
}

export function DocumentosView({ clienteId }: DocumentosViewProps) {
  const [pastas, setPastas] = useState<{ id: string; nome: string }[]>([]);
  const [pastaAtiva, setPastaAtiva] = useState("todas");
  const [novaPasta, setNovaPasta] = useState(false);
  const [nomePasta, setNomePasta] = useState("");
  const [salvandoPasta, setSalvandoPasta] = useState(false);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [atividades, setAtividades] = useState<Record<string, Atividade>>({});
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [docEditorOpen, setDocEditorOpen] = useState(false);
  const [cadernoEditorOpen, setCadernoEditorOpen] = useState(false);
  const [mindMapEditorOpen, setMindMapEditorOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const carregarDocumentos = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("documentos")
      .select("id, titulo, conteudo, created_at, updated_at, atividade_id, pasta_id")
      .eq("cliente_id", clienteId)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setDocumentos(data);
      
      // Carregar atividades vinculadas
      const atividadeIds = data
        .filter((d) => d.atividade_id)
        .map((d) => d.atividade_id as string);
      
      if (atividadeIds.length > 0) {
        const { data: atividadesData } = await supabase
          .from("atividades")
          .select("id, titulo")
          .in("id", atividadeIds);
        
        if (atividadesData) {
          const map: Record<string, Atividade> = {};
          atividadesData.forEach((a) => {
            map[a.id] = a;
          });
          setAtividades(map);
        }
      }
    }
    if (error) toast.error("Erro ao carregar documentos");
    const { data: folders, error: folderError } = await supabase.from("pastas_atividade")
      .select("id, nome").eq("cliente_id", clienteId).is("deleted_at", null).order("ordem");
    if (folderError) toast.error("Erro ao carregar pastas");
    else setPastas(folders || []);
    setLoading(false);
  };

  useEffect(() => {
    setPastaAtiva("todas");
    carregarDocumentos();
  }, [clienteId]);

  const criarPasta = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nomePasta.trim() || salvandoPasta) return;
    setSalvandoPasta(true);
    const { data, error } = await supabase.from("pastas_atividade").insert({
      cliente_id: clienteId, nome: nomePasta.trim(), ordem: pastas.length,
    }).select("id, nome").single();
    setSalvandoPasta(false);
    if (error) { toast.error("Erro ao criar pasta"); return; }
    setPastas(prev => [...prev, data]);
    setPastaAtiva(data.id);
    setNovaPasta(false);
    setNomePasta("");
    toast.success("Pasta criada");
  };

  const moverDocumento = async (docId: string, pastaId: string | null) => {
    const { error } = await supabase.from("documentos").update({ pasta_id: pastaId })
      .eq("id", docId).eq("cliente_id", clienteId);
    if (error) { toast.error("Erro ao mover documento"); return; }
    setDocumentos(prev => prev.map(doc => doc.id === docId ? { ...doc, pasta_id: pastaId } : doc));
    toast.success("Documento movido");
  };

  const seletorPasta = (doc: Documento) => <div className="px-4 pb-3" onClick={event => event.stopPropagation()}>
    <select aria-label={`Mover ${doc.titulo} para pasta`} value={doc.pasta_id || ""}
      className="w-full rounded-md border border-border bg-background p-2 text-xs text-muted-foreground"
      onChange={event => void moverDocumento(doc.id, event.target.value || null)}>
      <option value="">Sem pasta</option>
      {doc.pasta_id && !pastas.some(pasta => pasta.id === doc.pasta_id) && <option value={doc.pasta_id}>Pasta indisponível</option>}
      {pastas.map(pasta => <option key={pasta.id} value={pasta.id}>{pasta.nome}</option>)}
    </select>
  </div>;

  const criarNovoDocumento = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        pasta_id: pastaAtiva === "todas" || pastaAtiva === "sem-pasta" ? null : pastaAtiva,
        titulo: "Documento sem título",
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setDocEditorOpen(true);
    } else {
      toast.error("Erro ao criar documento");
    }
  };

  const criarNovoCaderno = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        pasta_id: pastaAtiva === "todas" || pastaAtiva === "sem-pasta" ? null : pastaAtiva,
        titulo: "Caderno sem título",
        conteudo: createEmptyCadernoContent(),
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setCadernoEditorOpen(true);
    } else {
      toast.error("Erro ao criar caderno");
    }
  };

  const criarNovoMapaMental = async () => {
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        cliente_id: clienteId,
        pasta_id: pastaAtiva === "todas" || pastaAtiva === "sem-pasta" ? null : pastaAtiva,
        titulo: "Mapa mental sem título",
        conteudo: createEmptyMindMapContent(),
      })
      .select()
      .single();

    if (data && !error) {
      setSelectedDocId(data.id);
      setMindMapEditorOpen(true);
    } else {
      toast.error("Erro ao criar mapa mental");
    }
  };

  const abrirDocumento = (docId: string) => {
    setSelectedDocId(docId);
    setDocEditorOpen(true);
  };

  const abrirCaderno = (docId: string) => {
    setSelectedDocId(docId);
    setCadernoEditorOpen(true);
  };

  const abrirMapaMental = (docId: string) => {
    setSelectedDocId(docId);
    setMindMapEditorOpen(true);
  };

  const excluirDocumento = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;

    const { error } = await supabase.from("documentos").delete().eq("id", docId);
    
    if (!error) {
      setDocumentos((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Documento excluído");
    } else {
      toast.error("Erro ao excluir documento");
    }
  };

  const handleCloseEditor = () => {
    setDocEditorOpen(false);
    setCadernoEditorOpen(false);
    setMindMapEditorOpen(false);
    setSelectedDocId(null);
    carregarDocumentos();
  };

  const tipoDocumento = (doc: Documento) => isMindMapContent(doc.conteudo) ? "mapa" : isCadernoContent(doc.conteudo) ? "caderno" : "documento";
  const documentosFiltrados = documentos.filter(doc =>
    doc.titulo.toLowerCase().includes(busca.toLowerCase()) &&
    (pastaAtiva === "todas" || (pastaAtiva === "sem-pasta" ? !doc.pasta_id : doc.pasta_id === pastaAtiva)) &&
    (tipoFiltro === "todos" || tipoDocumento(doc) === tipoFiltro)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Carregando documentos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
            Documentos
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setNovaPasta(true)}><FolderPlus className="mr-1 h-4 w-4" />Nova pasta</Button>
          <Button size="sm" variant="outline" onClick={criarNovoCaderno}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Caderno
          </Button>
          <Button size="sm" variant="outline" onClick={criarNovoMapaMental}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Mapa Mental
          </Button>
          <Button size="sm" onClick={criarNovoDocumento}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Documento
          </Button>
        </div>
      </div>

      {novaPasta && <form onSubmit={criarPasta} className="flex gap-2">
        <Input autoFocus aria-label="Nome da pasta" placeholder="Nome da pasta" value={nomePasta} onChange={event => setNomePasta(event.target.value)} />
        <Button type="submit" disabled={salvandoPasta || !nomePasta.trim()}>Criar pasta</Button>
        <Button type="button" variant="ghost" onClick={() => setNovaPasta(false)}>Cancelar</Button>
      </form>}
      <div className="flex flex-wrap gap-2" aria-label="Pastas de documentos">
        {[{ id: "todas", nome: "Todos" }, { id: "sem-pasta", nome: "Sem pasta" }, ...pastas].map(pasta =>
          <Button key={pasta.id} variant={pastaAtiva === pasta.id ? "default" : "outline"} onClick={() => setPastaAtiva(pasta.id)}
            onDragOver={event => { if (pasta.id !== "todas") event.preventDefault(); }}
            onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("application/documento-id"); if (documentos.some(doc => doc.id === id) && pasta.id !== "todas") void moverDocumento(id, pasta.id === "sem-pasta" ? null : pasta.id); }}>
            <Folder className="mr-2 h-4 w-4" />{pasta.nome}
          </Button>)}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar documentos..."
          className="pl-9 bg-muted/50 border-muted"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por tipo">
        {[{ id: "todos", nome: "Todos os tipos" }, { id: "documento", nome: "Documentos" }, { id: "mapa", nome: "Mapas mentais" }, { id: "caderno", nome: "Cadernos" }].map(tipo =>
          <Button key={tipo.id} size="sm" variant={tipoFiltro === tipo.id ? "secondary" : "ghost"} aria-pressed={tipoFiltro === tipo.id} onClick={() => setTipoFiltro(tipo.id)}>{tipo.nome}</Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{documentosFiltrados.length} itens</span>
      </div>
      {documentosFiltrados.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">Nenhum item encontrado.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {documentosFiltrados.map(doc => {
            const tipo = tipoDocumento(doc);
            const Icon = tipo === "mapa" ? Workflow : tipo === "caderno" ? BookOpen : FileText;
            const abrir = () => tipo === "mapa" ? abrirMapaMental(doc.id) : tipo === "caderno" ? abrirCaderno(doc.id) : abrirDocumento(doc.id);
            return <div key={doc.id} draggable onDragStart={event => event.dataTransfer.setData("application/documento-id", doc.id)}
              className={cn("rounded-lg border border-border bg-card transition-colors hover:border-primary/50 group")}>
              <div className="flex items-start gap-2 p-4 pb-2">
                <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={abrir}>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{doc.titulo}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{tipo === "mapa" ? "Mapa mental" : tipo === "caderno" ? "Caderno" : "Documento"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Atualizado {formatDistanceToNow(new Date(doc.updated_at), { locale: ptBR, addSuffix: true })}</p>
                  </div>
                </button>
                <Button size="icon" variant="ghost" aria-label={`Excluir ${doc.titulo}`} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={event => excluirDocumento(event, doc.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {doc.atividade_id && atividades[doc.atividade_id] && <div className="flex items-center gap-1 px-4 pb-2 text-xs text-muted-foreground"><LinkIcon className="h-3 w-3" /><span className="truncate">{atividades[doc.atividade_id].titulo}</span></div>}
              {seletorPasta(doc)}
            </div>;
          })}
        </div>
      )}

      {/* Document Editor Modal */}
      {docEditorOpen && selectedDocId && (
        <DocumentEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}

      {cadernoEditorOpen && selectedDocId && (
        <CadernoEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}

      {mindMapEditorOpen && selectedDocId && (
        <MindMapEditor documentoId={selectedDocId} onClose={handleCloseEditor} />
      )}
    </div>
  );
}
