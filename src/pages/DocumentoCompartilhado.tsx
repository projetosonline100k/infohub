import { FormEvent, useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { FileText, KeyRound, Loader2, LockKeyhole, LogOut, Mail, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentToolbar } from "@/components/documentos/DocumentToolbar";
import { PresencaAvatares } from "@/components/documentos/PresencaAvatares";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useDocumentoColaboracao } from "@/hooks/useDocumentoColaboracao";
import { cn } from "@/lib/utils";
import "@/components/documentos/editor.css";

type Status = "carregando" | "invalido" | "precisa-auth" | "pronto";

interface Meta {
  tipo: "documento" | "pasta";
  titulo: string;
  documento_id: string | null;
  pasta_id: string | null;
}

interface Guia {
  id: string;
  titulo: string;
}

// Página pública de um link de "Compartilhar". Não usa o layout do painel:
// quem chega aqui pode nunca ter tido conta. Fluxo: lê os metadados do
// token (sem precisar de sessão) -> se não estiver logado, pede pra criar
// conta ou entrar -> aceita o compartilhamento -> mostra o documento (ou,
// se for uma pasta inteira, a lista de guias dela).
export default function DocumentoCompartilhado() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("carregando");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!token) {
      setStatus("invalido");
      return;
    }
    const { data, error } = await supabase.rpc("compartilhamento_publico", { p_token: token });
    if (error || !data?.valido) {
      setStatus("invalido");
      return;
    }
    setMeta(data as Meta);

    const { data: sessao } = await supabase.auth.getSession();
    if (sessao.session) {
      await aceitar(token);
    } else {
      setStatus("precisa-auth");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const aceitar = async (t: string) => {
    const { error } = await supabase.rpc("aceitar_compartilhamento", { p_token: t });
    if (error) {
      setErro("Não foi possível liberar o acesso a este link. Tente abrir o link de novo.");
      setStatus("invalido");
      return;
    }
    setStatus("pronto");
  };

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && token) aceitar(token);
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "carregando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "invalido") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-foreground font-medium">Link inválido ou encerrado</p>
          <p className="text-sm text-muted-foreground">
            {erro || "Quem compartilhou este documento pode ter parado o compartilhamento. Peça um link novo."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "precisa-auth") {
    return <AcessoForm titulo={meta?.titulo || "documento"} />;
  }

  if (!meta) return null;
  return meta.tipo === "documento" ? (
    <DocumentoUnico documentoId={meta.documento_id as string} />
  ) : (
    <PastaCompartilhada pastaId={meta.pasta_id as string} tituloPasta={meta.titulo} />
  );
}

function AcessoForm({ titulo }: { titulo: string }) {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("cadastrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro("");
    setAviso("");
    setEnviando(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      setEnviando(false);
      if (error) setErro("E-mail ou senha incorretos.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { emailRedirectTo: window.location.href },
    });
    setEnviando(false);
    if (error) {
      setErro(error.message.includes("already registered") ? "Este e-mail já tem conta. Use \"Entrar\"." : "Não foi possível criar a conta.");
      return;
    }
    if (!data.session) {
      setAviso("Confirme o e-mail que enviamos para poder acessar o documento.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <FileText className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-card-foreground">Você foi convidado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para acessar <span className="font-medium text-foreground">"{titulo}"</span>, crie sua conta ou entre com uma já existente.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => { setModo("cadastrar"); setErro(""); setAviso(""); }}
            className={cn("rounded-md py-1.5 font-medium transition-colors", modo === "cadastrar" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            Criar conta
          </button>
          <button
            type="button"
            onClick={() => { setModo("entrar"); setErro(""); setAviso(""); }}
            className={cn("rounded-md py-1.5 font-medium transition-colors", modo === "entrar" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            Entrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="voce@exemplo.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="senha"
                type="password"
                required
                minLength={6}
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>
          {erro && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          {aviso && <p role="status" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{aviso}</p>}
          <Button type="submit" disabled={enviando} className="h-11 w-full text-base">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {enviando ? "Enviando…" : modo === "entrar" ? "Entrar e acessar" : "Criar conta e acessar"}
          </Button>
        </form>
      </section>
    </div>
  );
}

export interface EditorDoDocumentoHandle {
  flush: () => void;
}

// Editor de um único documento (tiptap + autosave), sem os controles de
// gerenciamento da barra lateral do dono — o convidado só lê/edita o texto.
const EditorDoDocumento = forwardRef<EditorDoDocumentoHandle, {
  documentoId: string;
  titulo: string;
  onTituloChange: (v: string) => void;
  onSalvarTitulo: () => void;
}>(function EditorDoDocumento({ documentoId, titulo, onTituloChange, onSalvarTitulo }, ref) {
  const { saving, debouncedSave, saveNow } = useAutoSave({ documentoId, debounceMs: 1000 });
  const [carregandoConteudo, setCarregandoConteudo] = useState(true);
  const tituloFocadoRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Comece a escrever..." }),
      Link.configure({ openOnClick: true }),
      Highlight.configure({ multicolor: false }),
    ],
    content: "",
    onUpdate: ({ editor }) => debouncedSave(editor.getHTML()),
  });

  const { pessoasOnline } = useDocumentoColaboracao({
    documentoId,
    editor,
    tituloFocadoRef,
    onConteudoRemoto: (novo) => editor?.commands.setContent(novo, { emitUpdate: false }),
    onTituloRemoto: onTituloChange,
  });

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setCarregandoConteudo(true);
      const { data } = await supabase.from("documentos").select("conteudo").eq("id", documentoId).maybeSingle();
      if (!cancelado && editor) editor.commands.setContent(data?.conteudo || "");
      if (!cancelado) setCarregandoConteudo(false);
    }
    if (documentoId && editor) carregar();
    return () => { cancelado = true; };
  }, [documentoId, editor]);

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (editor) saveNow(editor.getHTML());
    },
  }), [editor, saveNow]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Input
          value={titulo}
          onChange={(e) => onTituloChange(e.target.value)}
          onFocus={() => { tituloFocadoRef.current = true; }}
          onBlur={() => { tituloFocadoRef.current = false; onSalvarTitulo(); }}
          className="text-lg font-medium border-none bg-transparent shadow-none focus-visible:ring-0 max-w-md"
        />
        <div className="ml-auto flex items-center gap-3">
          <PresencaAvatares pessoas={pessoasOnline} />
          <span className="text-xs text-muted-foreground">{saving ? "Salvando..." : ""}</span>
        </div>
      </div>
      <DocumentToolbar editor={editor} />
      <div className={cn("flex-1 overflow-auto bg-muted/50 p-8 transition-opacity duration-150", carregandoConteudo && "opacity-40")}>
        <div className="max-w-[816px] mx-auto bg-background shadow-lg min-h-[1056px] rounded-sm">
          <div className="p-16">
            <EditorContent editor={editor} className="prose prose-lg max-w-none dark:prose-invert document-editor" />
          </div>
        </div>
      </div>
    </div>
  );
});

function TopoCompartilhado({ children }: { children: React.ReactNode }) {
  const sair = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/40 text-xs text-muted-foreground shrink-0">
        <span>Documento compartilhado com você</span>
        <button onClick={sair} className="flex items-center gap-1 hover:text-foreground">
          <LogOut className="h-3 w-3" /> Sair
        </button>
      </div>
      {children}
    </div>
  );
}

function DocumentoUnico({ documentoId }: { documentoId: string }) {
  const [titulo, setTitulo] = useState("Documento sem título");

  useEffect(() => {
    supabase.from("documentos").select("titulo").eq("id", documentoId).maybeSingle().then(({ data }) => {
      if (data?.titulo) setTitulo(data.titulo);
    });
  }, [documentoId]);

  const salvarTitulo = useCallback(async () => {
    await supabase.from("documentos").update({ titulo }).eq("id", documentoId);
  }, [titulo, documentoId]);

  return (
    <TopoCompartilhado>
      <EditorDoDocumento documentoId={documentoId} titulo={titulo} onTituloChange={setTitulo} onSalvarTitulo={salvarTitulo} />
    </TopoCompartilhado>
  );
}

function PastaCompartilhada({ pastaId, tituloPasta }: { pastaId: string; tituloPasta: string }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [guiaAtualId, setGuiaAtualId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("Documento sem título");
  const editorRef = useRef<EditorDoDocumentoHandle>(null);

  const trocarGuia = (novoId: string) => {
    if (novoId === guiaAtualId) return;
    editorRef.current?.flush();
    setGuiaAtualId(novoId);
  };

  const carregarGuias = useCallback(async () => {
    // Ordem fixa por criação — não por "atualizado por último", pra lista
    // não pular de posição embaixo do cursor de quem está clicando.
    const { data } = await supabase.from("documentos").select("id, titulo").eq("pasta_id", pastaId).order("created_at", { ascending: true });
    setGuias(data || []);
    setGuiaAtualId((atual) => atual || data?.[0]?.id || null);
  }, [pastaId]);

  useEffect(() => {
    carregarGuias();
  }, [carregarGuias]);

  useEffect(() => {
    if (!guiaAtualId) return;
    supabase.from("documentos").select("titulo").eq("id", guiaAtualId).maybeSingle().then(({ data }) => {
      if (data?.titulo) setTitulo(data.titulo);
    });
  }, [guiaAtualId]);

  const salvarTitulo = useCallback(async () => {
    if (!guiaAtualId) return;
    await supabase.from("documentos").update({ titulo }).eq("id", guiaAtualId);
    setGuias((prev) => prev.map((g) => (g.id === guiaAtualId ? { ...g, titulo } : g)));
  }, [titulo, guiaAtualId]);

  return (
    <TopoCompartilhado>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
          <div className="p-4 border-b">
            <span className="text-sm font-medium">{tituloPasta}</span>
          </div>
          <div className="p-2 space-y-1 overflow-auto">
            {guias.map((guia) => (
              <button
                key={guia.id}
                onClick={() => trocarGuia(guia.id)}
                className={cn(
                  "w-full text-left p-2 rounded hover:bg-muted text-sm flex items-center gap-2 transition-colors",
                  guia.id === guiaAtualId && "bg-muted font-medium"
                )}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{guia.id === guiaAtualId ? titulo || "Sem título" : guia.titulo || "Sem título"}</span>
              </button>
            ))}
          </div>
        </div>
        {guiaAtualId ? (
          <EditorDoDocumento ref={editorRef} documentoId={guiaAtualId} titulo={titulo} onTituloChange={setTitulo} onSalvarTitulo={salvarTitulo} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Esta pasta ainda não tem documentos.</div>
        )}
      </div>
    </TopoCompartilhado>
  );
}
