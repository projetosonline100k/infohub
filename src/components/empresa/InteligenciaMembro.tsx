import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Brain, Clock, FileText, GraduationCap, Link2, Loader2, Trash2, Type, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ALCANCES, chaveAgente, nomeSeguro, resumo, separarPorAlcance, tamanhoLegivel, tipoDoArquivo, tituloSemExtensao,
  type Alcance, type ItemInteligencia, type TipoInteligencia,
} from "@/lib/empresa/inteligencia";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

// Inteligência do funcionário (clique nele no mapa da operação): PDFs,
// textos, vídeos e links que formam o conhecimento dele. PDF e texto viram
// texto aqui mesmo; vídeo e link ficam "na fila" até o Mac transcrever
// (scripts/inteligencia/processar.py). Ver docs/agentes/italo-copy.md.

const CAMPOS = "id, cliente_id, agente, escopo, tipo, nome, observacao, arquivo_path, link, caracteres, status, mensagem, created_at";
const LINK_VALIDO_DIAS = 7;
const ICONES: Record<TipoInteligencia, typeof FileText> = { pdf: FileText, texto: Type, video: Video, link: Link2, aprendizado: GraduationCap };

export function InteligenciaMembro({ clienteId, membro }: { clienteId: string; membro: MembroResumo }) {
  const [itens, setItens] = useState<ItemInteligencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [alcance, setAlcance] = useState<Alcance>("projeto");
  const [modo, setModo] = useState<"nada" | "texto" | "link">("nada");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ id: string; texto: string } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const agente = chaveAgente(membro.nome);

  const carregar = useCallback(async () => {
    const { data: cliente } = await supabase.from("clientes").select("user_id").eq("id", clienteId).maybeSingle();
    let consulta = supabase.from("inteligencia_membros").select(CAMPOS).eq("agente", agente)
      .or(`escopo.eq.geral,cliente_id.eq.${clienteId}`).order("created_at", { ascending: false });
    // O "geral" é do dono do projeto: não mistura com o de outra empresa.
    if (cliente?.user_id) consulta = consulta.eq("user_id", cliente.user_id);
    const { data, error } = await consulta;
    if (error) toast.error("Não consegui carregar a inteligência");
    setItens((data || []) as ItemInteligencia[]);
    setCarregando(false);
  }, [agente, clienteId]);

  useEffect(() => { setCarregando(true); void carregar(); }, [carregar]);

  // Enquanto o Mac transcreve, confere de tempos em tempos.
  const temFila = itens.some((i) => i.status === "pendente" || i.status === "processando");
  useEffect(() => {
    if (!temFila) return;
    const t = window.setInterval(() => void carregar(), 15000);
    return () => window.clearInterval(t);
  }, [temFila, carregar]);

  const inserir = async (linha: Omit<TablesInsert<"inteligencia_membros">, "cliente_id" | "agente">) => {
    const { error } = await supabase.from("inteligencia_membros").insert({
      cliente_id: clienteId, membro_id: membro.id, agente, escopo: alcance, ...linha,
    });
    if (error) throw error;
  };

  const enviarArquivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    for (const arquivo of Array.from(lista)) {
      const tipo = tipoDoArquivo(arquivo.name, arquivo.type);
      if (!tipo) { toast.error(`${arquivo.name}: envie PDF, texto, vídeo ou áudio`); continue; }
      setEnviando(`Enviando ${arquivo.name}…`);
      try {
        const caminho = `${clienteId}/${membro.id}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
        const { error: erroUpload } = await supabase.storage.from("inteligencia").upload(caminho, arquivo, { contentType: arquivo.type || undefined });
        if (erroUpload) throw new Error(/size|large|exceed/i.test(erroUpload.message) ? "arquivo grande demais: cole um link no lugar" : erroUpload.message);
        const nome = tituloSemExtensao(arquivo.name);
        if (tipo === "video") {
          // O Mac baixa por este link assinado e transcreve.
          const { data: assinado } = await supabase.storage.from("inteligencia").createSignedUrl(caminho, LINK_VALIDO_DIAS * 86400);
          await inserir({ tipo, nome, arquivo_path: caminho, link: assinado?.signedUrl ?? null, status: "pendente" });
        } else {
          let conteudo: string;
          if (tipo === "pdf") {
            const { lerTextoPdf } = await import("@/lib/empresa/lerPdf");
            conteudo = await lerTextoPdf(arquivo, (n, total) => setEnviando(`Lendo ${arquivo.name}: página ${n} de ${total}`));
          } else {
            conteudo = await arquivo.text();
          }
          const vazio = !conteudo.trim();
          await inserir({
            tipo, nome, arquivo_path: caminho, conteudo: vazio ? null : conteudo, status: vazio ? "erro" : "pronto",
            mensagem: vazio ? "Não achei texto no PDF (parece escaneado, só imagem)." : null,
          });
        }
        toast.success(`${arquivo.name} entrou na inteligência de ${membro.nome}`);
      } catch (e) {
        toast.error(`${arquivo.name}: ${e instanceof Error ? e.message : "não consegui enviar"}`);
      }
    }
    setEnviando(null);
    if (arquivoRef.current) arquivoRef.current.value = "";
    void carregar();
  };

  const salvarTextoOuLink = async () => {
    const valor = texto.trim();
    if (!valor) return;
    setEnviando("Salvando…");
    try {
      if (modo === "link") {
        if (!/^https?:\/\//i.test(valor)) throw new Error("o link precisa começar com http");
        await inserir({ tipo: "link", nome: titulo.trim() || valor, link: valor, status: "pendente" });
      } else {
        await inserir({ tipo: "texto", nome: titulo.trim() || valor.slice(0, 60), conteudo: valor, status: "pronto" });
      }
      setTitulo(""); setTexto(""); setModo("nada");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setEnviando(null);
    }
  };

  const excluir = async (item: ItemInteligencia) => {
    if (!window.confirm(`Tirar "${item.nome}" da inteligência de ${membro.nome}?`)) return;
    const { error } = await supabase.from("inteligencia_membros").delete().eq("id", item.id);
    if (error) { toast.error("Não consegui excluir"); return; }
    if (item.arquivo_path) await supabase.storage.from("inteligencia").remove([item.arquivo_path]);
    setItens((atual) => atual.filter((i) => i.id !== item.id));
  };

  const mudarAlcance = async (item: ItemInteligencia, novo: Alcance) => {
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, escopo: novo } : i)));
    const { error } = await supabase.from("inteligencia_membros").update({ escopo: novo }).eq("id", item.id);
    if (error) { toast.error("Não consegui mudar"); void carregar(); }
  };

  const verTrecho = async (item: ItemInteligencia) => {
    if (aberto?.id === item.id) { setAberto(null); return; }
    const { data } = await supabase.from("inteligencia_membros").select("conteudo").eq("id", item.id).maybeSingle();
    const conteudo = (data as { conteudo: string | null } | null)?.conteudo ?? "";
    setAberto({ id: item.id, texto: item.tipo === "aprendizado" ? conteudo : conteudo.slice(0, 1500) + (conteudo.length > 1500 ? "…" : "") });
  };
  // O Davi corrige o que o funcionário aprendeu (uma regra por linha).
  const salvarAprendizado = async (item: ItemInteligencia, texto: string) => {
    const { error } = await supabase.from("inteligencia_membros").update({ conteudo: texto.trim() || null }).eq("id", item.id);
    if (error) { toast.error("Não consegui salvar"); return; }
    toast.success("Aprendizados salvos");
    setAberto({ id: item.id, texto });
    void carregar();
  };

  const { geral, projeto } = separarPorAlcance(itens, clienteId);
  const r = resumo([...geral, ...projeto]);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-violet-500" />
        <p className="text-sm font-semibold">Inteligência de {membro.nome}</p>
        <span className="ml-auto text-xs text-muted-foreground">
          {r.prontos} {r.prontos === 1 ? "item" : "itens"}{r.caracteres ? ` · ${tamanhoLegivel(r.caracteres)}` : ""}{r.pendentes ? ` · ${r.pendentes} na fila` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {ALCANCES.map((a) => (
          <button key={a.valor} type="button" onClick={() => setAlcance(a.valor)}
            className={cn("rounded-md border p-2 text-left text-xs transition-colors", alcance === a.valor ? "border-violet-500 bg-violet-500/10" : "hover:bg-muted")}>
            <span className="block font-medium">{a.rotulo}</span>
            <span className="text-muted-foreground">{a.ajuda}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input ref={arquivoRef} type="file" multiple className="hidden"
          accept=".pdf,.txt,.md,application/pdf,text/plain,video/*,audio/*" onChange={(e) => void enviarArquivos(e.target.files)} />
        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!!enviando} onClick={() => arquivoRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />PDF, vídeo ou áudio
        </Button>
        <Button size="sm" variant={modo === "texto" ? "secondary" : "outline"} className="h-8 gap-1.5" disabled={!!enviando} onClick={() => setModo(modo === "texto" ? "nada" : "texto")}>
          <Type className="h-3.5 w-3.5" />Colar texto
        </Button>
        <Button size="sm" variant={modo === "link" ? "secondary" : "outline"} className="h-8 gap-1.5" disabled={!!enviando} onClick={() => setModo(modo === "link" ? "nada" : "link")}>
          <Link2 className="h-3.5 w-3.5" />Link
        </Button>
      </div>

      {modo !== "nada" && (
        <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); void salvarTextoOuLink(); }}>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome (ex.: Quizzes que funcionam)" className="h-8 text-sm" />
          {modo === "texto"
            ? <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui o texto" rows={5} className="text-sm" />
            : <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="https://… (YouTube ou link direto de vídeo/áudio)" className="h-8 text-sm" />}
          <Button type="submit" size="sm" className="h-8" disabled={!texto.trim() || !!enviando}>Salvar</Button>
        </form>
      )}

      {enviando && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{enviando}</p>}

      {carregando ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          <Lista titulo="Geral (vai para todo projeto)" itens={geral} vazio="Nada geral ainda." aberto={aberto}
            onVer={verTrecho} onExcluir={excluir} onAlcance={mudarAlcance} onSalvarAprendizado={salvarAprendizado} />
          <Lista titulo="Só deste projeto" itens={projeto} vazio="Nada deste projeto ainda." aberto={aberto}
            onVer={verTrecho} onExcluir={excluir} onAlcance={mudarAlcance} onSalvarAprendizado={salvarAprendizado} />
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, itens, vazio, aberto, onVer, onExcluir, onAlcance, onSalvarAprendizado }: {
  titulo: string; itens: ItemInteligencia[]; vazio: string; aberto: { id: string; texto: string } | null;
  onVer: (i: ItemInteligencia) => void; onExcluir: (i: ItemInteligencia) => void; onAlcance: (i: ItemInteligencia, a: Alcance) => void;
  onSalvarAprendizado: (i: ItemInteligencia, texto: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo} ({itens.length})</p>
      {itens.length === 0 ? <p className="py-1 text-xs text-muted-foreground">{vazio}</p> : (
        <div className="space-y-1">
          {itens.map((item) => {
            const Icone = ICONES[item.tipo] ?? FileText;
            const fila = item.status === "pendente" || item.status === "processando";
            return (
              <div key={item.id} className="rounded-md border">
                <div className="flex items-center gap-2 p-1.5">
                  <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={item.status !== "pronto"} onClick={() => onVer(item)}
                    title={item.status === "pronto" ? "Ver um trecho" : undefined}>
                    <p className="truncate text-sm">{item.nome}</p>
                    <p className={cn("flex items-center gap-1 text-[11px]", item.status === "erro" ? "text-rose-500" : "text-muted-foreground")}>
                      {item.status === "pronto" && tamanhoLegivel(item.caracteres)}
                      {fila && <><Clock className="h-3 w-3" />{item.status === "processando" ? "transcrevendo no Mac…" : "na fila do Mac para transcrever"}</>}
                      {item.status === "erro" && <><AlertTriangle className="h-3 w-3" />{item.mensagem || "deu erro"}</>}
                    </p>
                  </button>
                  <select value={item.escopo} onChange={(e) => onAlcance(item, e.target.value as Alcance)} aria-label="Alcance"
                    className="h-7 shrink-0 rounded-md border bg-background px-1 text-[11px]">
                    <option value="geral">Geral</option>
                    <option value="projeto">Deste projeto</option>
                  </select>
                  <button type="button" onClick={() => onExcluir(item)} title="Excluir" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {aberto?.id === item.id && (item.tipo === "aprendizado"
                  ? <EditarAprendizado texto={aberto.texto} onSalvar={(t) => onSalvarAprendizado(item, t)} />
                  : <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t bg-muted/40 p-2 text-[11px] leading-relaxed">{aberto.texto || "(vazio)"}</pre>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditarAprendizado({ texto, onSalvar }: { texto: string; onSalvar: (t: string) => void }) {
  const [valor, setValor] = useState(texto);
  return (
    <div className="space-y-1.5 border-t bg-muted/40 p-2">
      <p className="text-[11px] text-muted-foreground">O que ele aprendeu com você (uma regra por linha). Corrija ou apague o que não vale.</p>
      <Textarea value={valor} onChange={(e) => setValor(e.target.value)} rows={Math.min(10, Math.max(3, valor.split("\n").length + 1))} className="text-xs" />
      <div className="flex justify-end"><Button size="sm" className="h-7" disabled={valor === texto} onClick={() => onSalvar(valor)}>Salvar</Button></div>
    </div>
  );
}
