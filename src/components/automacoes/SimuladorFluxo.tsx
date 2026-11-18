import { useEffect, useRef, useState } from "react";
import { Clock, FlaskConical, GitBranch, Link2, RotateCcw, Send, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { destinoDe, preencherVariaveis, primeiroNo, respostasDoNo, type GrafoFluxo, type NoFluxo } from "../../../supabase/functions/_shared/fluxo";

// Modo teste (18/11/2026, Davi: "algo como modo teste, para eu testar direto no sistema"): anda pelo fluxo no próprio editor, como numa conversa,
// sem mandar nada de verdade. Você toca nos botões (ou escreve), pula as esperas e responde as condições na mão.

type Item =
  | { k: "msg"; texto: string; imagem?: string; respostas: { id: string; titulo: string }[]; links: { titulo: string; url: string }[] }
  | { k: "midia"; texto: string; tipo: string; url?: string }
  | { k: "eu"; texto: string }
  | { k: "aviso"; texto: string; icone: "tempo" | "tag" | "cond" | "fim" };
type Espera = { tipo: "resposta"; no: NoFluxo } | { tipo: "tempo"; no: NoFluxo } | { tipo: "condicao"; no: NoFluxo } | null;

const VARS = { nome: "Davi", nome_completo: "Davi Souza", usuario: "@davi", email: "davi@exemplo.com", whatsapp: "11999999999", perfil: "" };
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const minutosTexto = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)} dia(s)` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
const condicaoTexto = (n: NoFluxo) => {
  const d = n.dados;
  switch (d.condicao) {
    case "texto_contem": return `A resposta contém “${d.palavra ?? ""}”?`;
    case "comprou": return "O lead já comprou?";
    case "checkout": return "O lead abriu o checkout?";
    case "tem_tag": return `O lead tem a tag “${d.tag_nome ?? ""}”?`;
    case "perfil": return `O perfil do quiz é “${d.palavra ?? ""}”?`;
    default: return "A pessoa respondeu?";
  }
};

/** Anda a partir de `inicio` até uma pausa (resposta, tempo ou condição) ou o fim. */
function andar(g: GrafoFluxo, inicio: NoFluxo | null): { itens: Item[]; espera: Espera } {
  const itens: Item[] = [];
  let atual = inicio;
  for (let i = 0; i < 40; i++) {
    if (!atual) { itens.push({ k: "aviso", texto: "Fim do fluxo (nenhum caminho continua daqui).", icone: "fim" }); return { itens, espera: null }; }
    const d = atual.dados;
    if (atual.tipo === "fim") { itens.push({ k: "aviso", texto: "Fim do fluxo.", icone: "fim" }); return { itens, espera: null }; }
    if (atual.tipo === "mensagem") {
      const respostas = respostasDoNo(atual).map((b) => ({ id: b.id, titulo: b.titulo }));
      itens.push({ k: "msg", texto: preencherVariaveis(d.texto ?? "", VARS), imagem: d.midia_tipo === "imagem" ? d.midia_url : undefined, respostas, links: (d.botoes ?? []).filter((b) => b.tipo === "link").map((b) => ({ titulo: b.titulo, url: b.url ?? "" })) });
      if (respostas.length) return { itens, espera: { tipo: "resposta", no: atual } };
    } else if (atual.tipo === "midia") {
      itens.push({ k: "midia", texto: preencherVariaveis(d.texto ?? "", VARS), tipo: d.midia_tipo ?? "arquivo", url: d.midia_url });
    } else if (atual.tipo === "tag") {
      itens.push({ k: "aviso", texto: `Tag ${d.tag_acao === "remover" ? "tirada" : "posta"}: ${d.tag_nome ?? ""}`, icone: "tag" });
    } else if (atual.tipo === "esperar") {
      itens.push({ k: "aviso", texto: `Esperaria ${minutosTexto(d.minutos ?? 0)}`, icone: "tempo" });
      return { itens, espera: { tipo: "tempo", no: atual } };
    } else if (atual.tipo === "condicao") {
      return { itens, espera: { tipo: "condicao", no: atual } };
    }
    atual = destinoDe(g, atual.id, "proximo");
  }
  itens.push({ k: "aviso", texto: "Passou de 40 blocos seguidos (laço no fluxo).", icone: "fim" });
  return { itens, espera: null };
}

export function SimuladorFluxo({ aberto, grafo, onFechar }: { aberto: boolean; grafo: GrafoFluxo; onFechar: () => void }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [espera, setEspera] = useState<Espera>(null);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const recomecar = () => {
    const r = andar(grafo, primeiroNo(grafo));
    setItens(r.itens.length ? r.itens : [{ k: "aviso", texto: "Ligue o início a uma primeira mensagem.", icone: "fim" }]); setEspera(r.espera); setTexto("");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aberto) recomecar(); }, [aberto]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [itens, espera]);

  const seguir = (de: NoFluxo, saida: string, falou?: string) => {
    const r = andar(grafo, destinoDe(grafo, de.id, saida));
    setItens((a) => [...a, ...(falou ? [{ k: "eu" as const, texto: falou }] : []), ...r.itens]); setEspera(r.espera); setTexto("");
  };
  const responder = (no: NoFluxo, t: string) => {
    const r = respostasDoNo(no), bruto = t.trim();
    const m = bruto.match(/^\s*(\d{1,2})\s*[).:-]?\s*$/);
    const porNumero = m && +m[1] >= 1 && +m[1] <= r.length ? r[+m[1] - 1] : undefined;
    const porTitulo = r.find((b) => norm(b.titulo) && ` ${norm(bruto)} `.includes(` ${norm(b.titulo)} `));
    seguir(no, (porNumero ?? porTitulo)?.id ?? "outro", bruto);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="dark flex h-[88vh] max-h-[88vh] w-[min(440px,96vw)] flex-col gap-0 overflow-hidden border-white/10 bg-[#0a1520] p-0 text-white">
        <DialogTitle className="flex items-center gap-2 border-b border-white/10 bg-[#0c1b27] px-4 py-3 text-sm"><FlaskConical className="h-4 w-4 text-amber-300" />Modo teste
          <Button type="button" variant="ghost" size="sm" onClick={recomecar} className="ml-auto mr-6 h-7 gap-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"><RotateCcw className="h-3 w-3" />Recomeçar</Button></DialogTitle>
        <DialogDescription className="border-b border-white/10 px-4 py-2 text-[11px] text-white/45">Simulação: nada é enviado de verdade. Toque nos botões como se fosse o lead (Davi Souza); as esperas você pula.</DialogDescription>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0b141a] px-3 py-3">
          {itens.map((it, i) => it.k === "eu" ? (
            <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#005c4b] px-3 py-2 text-[13px]">{it.texto}</p></div>
          ) : it.k === "aviso" ? (
            <p key={i} className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-white/45">
              {it.icone === "tempo" && <Clock className="h-3 w-3" />}{it.icone === "tag" && <Tag className="h-3 w-3" />}{it.icone === "cond" && <GitBranch className="h-3 w-3" />}{it.texto}</p>
          ) : it.k === "midia" ? (
            <div key={i} className="max-w-[85%] space-y-1 rounded-2xl rounded-bl-sm bg-[#202c33] p-2 text-[13px]">
              {it.tipo === "imagem" && it.url ? <img src={it.url} alt="" className="max-h-52 w-full rounded-lg object-cover" /> : <p className="text-white/60">[{it.tipo}]</p>}
              {it.texto && <p className="whitespace-pre-wrap px-1">{it.texto}</p>}</div>
          ) : (
            <div key={i} className="max-w-[85%] space-y-1 rounded-2xl rounded-bl-sm bg-[#202c33] p-2 text-[13px]">
              {it.imagem && <img src={it.imagem} alt="" className="max-h-52 w-full rounded-lg object-cover" />}
              <p className="whitespace-pre-wrap px-1">{it.texto || <span className="text-white/35">(mensagem vazia)</span>}</p>
              {it.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-xs text-cyan-200 hover:bg-white/5"><Link2 className="h-3 w-3" />{l.titulo}</a>)}
              {it.respostas.length > 0 && <p className="px-1 pt-0.5 text-[10px] text-white/40">{i === itens.length - 1 || espera?.tipo === "resposta" ? "Toque numa opção abaixo ou escreva" : ""}</p>}
            </div>))}
          {espera?.tipo === "resposta" && (
            <div className="space-y-1.5 pt-1">{respostasDoNo(espera.no).map((b) => (
              <button key={b.id} type="button" onClick={() => seguir(espera.no, b.id, b.titulo)} className="block w-full rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-left text-xs text-cyan-100 hover:bg-cyan-300/20">{b.titulo || "Botão"}</button>))}
              <button type="button" onClick={() => seguir(espera.no, "outro", "(outra resposta)")} className="block w-full rounded-lg border border-white/15 px-3 py-2 text-left text-xs text-white/60 hover:bg-white/5">Outra resposta</button></div>)}
          {espera?.tipo === "tempo" && <Button type="button" size="sm" onClick={() => seguir(espera.no, "proximo")} className="w-full bg-amber-400 text-black hover:bg-amber-300"><Clock className="mr-1.5 h-3.5 w-3.5" />Pular a espera</Button>}
          {espera?.tipo === "condicao" && (
            <div className="space-y-1.5 rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/5 p-2.5"><p className="flex items-center gap-1.5 text-xs text-fuchsia-100"><GitBranch className="h-3.5 w-3.5" />Condição: {condicaoTexto(espera.no)}</p>
              <div className="grid grid-cols-2 gap-1.5"><Button type="button" size="sm" variant="outline" onClick={() => seguir(espera.no, "sim", "Sim")} className="border-white/20 bg-transparent text-white hover:bg-white/10">Sim</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => seguir(espera.no, "nao", "Não")} className="border-white/20 bg-transparent text-white hover:bg-white/10">Não</Button></div></div>)}
          <div ref={fim} />
        </div>
        <form className={cn("flex gap-2 border-t border-white/10 bg-[#0c1b27] p-2.5", espera?.tipo !== "resposta" && "opacity-40")} onSubmit={(e) => { e.preventDefault(); if (espera?.tipo === "resposta" && texto.trim()) responder(espera.no, texto); }}>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={espera?.tipo !== "resposta"} placeholder={espera?.tipo === "resposta" ? "Escreva o número ou o texto da resposta" : "Nada a responder agora"} className="h-9 border-white/15 bg-black/30 text-sm" />
          <Button type="submit" size="sm" disabled={espera?.tipo !== "resposta" || !texto.trim()} className="h-9"><Send className="h-4 w-4" /></Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
