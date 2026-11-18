import { useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCheck, Clock, FlaskConical, GitBranch, Link2, Mic, Plus, RotateCcw, Send, Smile, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { destinoDe, preencherVariaveis, primeiroNo, respostasDoNo, type GrafoFluxo, type NoFluxo } from "../../../supabase/functions/_shared/fluxo";

// Modo teste (18/11/2026, Davi: "algo como modo teste, para eu testar direto no sistema"): anda pelo fluxo no próprio editor, como numa conversa,
// sem mandar nada de verdade. Você toca nos botões (ou escreve), pula as esperas e responde as condições na mão.

const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
type Item =
  | { k: "msg"; texto: string; imagem?: string; video?: string; respostas: { id: string; titulo: string }[]; links: { titulo: string; url: string }[] }
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
      itens.push({ k: "msg", texto: preencherVariaveis(d.texto ?? "", VARS), imagem: d.midia_tipo === "imagem" ? d.midia_url : undefined, video: d.midia_tipo === "video" ? d.midia_url : undefined, respostas, links: (d.botoes ?? []).filter((b) => b.tipo === "link").map((b) => ({ titulo: b.titulo, url: b.url ?? "" })) });
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

export function SimuladorFluxo({ aberto, grafo, whatsapp = false, onFechar }: { aberto: boolean; grafo: GrafoFluxo; whatsapp?: boolean; onFechar: () => void }) {
  const [itens, setItens] = useState<(Item & { h?: string })[]>([]);
  const [espera, setEspera] = useState<Espera>(null);
  const [voto, setVoto] = useState<string | null>(null);   // opção da enquete que acabou de ser tocada (some quando o fluxo segue)
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const carimbo = (a: Item[]) => a.map((x) => ({ ...x, h: hora() }));

  const recomecar = () => {
    const r = andar(grafo, primeiroNo(grafo));
    setItens(carimbo(r.itens.length ? r.itens : [{ k: "aviso", texto: "Ligue o início a uma primeira mensagem.", icone: "fim" }])); setEspera(r.espera); setTexto(""); setVoto(null);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aberto) recomecar(); }, [aberto]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [itens, espera, voto]);

  const seguir = (de: NoFluxo, saida: string, falou?: string) => {
    const r = andar(grafo, destinoDe(grafo, de.id, saida));
    setItens((a) => [...a, ...carimbo([...(falou ? [{ k: "eu" as const, texto: falou }] : []), ...r.itens])]); setEspera(r.espera); setTexto(""); setVoto(null);
  };
  // Enquete do WhatsApp: tocar marca a opção (com o ✓ e a barra) e o robô segue um instante depois, como no de verdade.
  const votar = (no: NoFluxo, b: { id: string; titulo: string }) => { setVoto(b.id); window.setTimeout(() => seguir(no, b.id), 650); };
  const responder = (no: NoFluxo, t: string) => {
    const r = respostasDoNo(no), bruto = t.trim();
    const m = bruto.match(/^\s*(\d{1,2})\s*[).:-]?\s*$/);
    const porNumero = m && +m[1] >= 1 && +m[1] <= r.length ? r[+m[1] - 1] : undefined;
    const porTitulo = r.find((b) => norm(b.titulo) && ` ${norm(bruto)} `.includes(` ${norm(b.titulo)} `));
    seguir(no, (porNumero ?? porTitulo)?.id ?? "outro", bruto);
  };
  const enquete = !!espera && espera.tipo === "resposta" && whatsapp && (() => { const r = respostasDoNo(espera.no); return r.length >= 2 && r.length <= 12; })();
  const lista = espera?.tipo === "resposta" && !enquete;
  const balao = "relative max-w-[85%] rounded-lg rounded-tl-none bg-[#202c33] px-2 py-1.5 text-[13.5px] leading-snug text-[#e9edef] shadow-sm";
  const Hora = ({ h, meu }: { h?: string; meu?: boolean }) => <span className="float-right ml-3 mt-1.5 flex items-center gap-0.5 text-[10px] text-white/45">{h}{meu && <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />}</span>;
  const ultimaMsg = [...itens].reverse().findIndex((x) => x.k === "msg");
  const idxUltimaMsg = ultimaMsg < 0 ? -1 : itens.length - 1 - ultimaMsg;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="dark flex h-[90vh] max-h-[90vh] w-[min(420px,96vw)] flex-col gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#0b141a] p-0 text-white [&>button]:hidden">
        <DialogTitle className="sr-only">Modo teste</DialogTitle>
        <DialogDescription className="sr-only">Simulação do fluxo como uma conversa de {whatsapp ? "WhatsApp" : "direct"}. Nada é enviado.</DialogDescription>
        <div className="flex items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6a7175] text-sm font-semibold">D</div>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-[15px] font-medium text-[#e9edef]">Davi Souza</p><p className="flex items-center gap-1 text-[11px] text-amber-300"><FlaskConical className="h-3 w-3" />modo teste · nada é enviado de verdade</p></div>
          <button type="button" onClick={recomecar} title="Recomeçar" className="rounded-full p-2 text-white/70 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={onFechar} title="Fechar" className="rounded-full p-2 text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3" style={{ backgroundColor: "#0b141a", backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1.4px)", backgroundSize: "18px 18px" }}>
          <p className="mx-auto w-fit rounded-lg bg-[#182229] px-2.5 py-1 text-[11px] uppercase text-[#8696a0]">Hoje</p>
          {itens.map((it, i) => it.k === "eu" ? (
            <div key={i} className="flex justify-end"><div className="relative max-w-[80%] rounded-lg rounded-tr-none bg-[#005c4b] px-2 py-1.5 text-[13.5px] text-[#e9edef] shadow-sm">{it.texto}<Hora h={it.h} meu /></div></div>
          ) : it.k === "aviso" ? (
            <p key={i} className="mx-auto flex w-fit max-w-[90%] items-center justify-center gap-1.5 rounded-lg bg-[#182229] px-2.5 py-1 text-[11px] text-[#8696a0]">
              {it.icone === "tempo" && <Clock className="h-3 w-3" />}{it.icone === "tag" && <Tag className="h-3 w-3" />}{it.icone === "cond" && <GitBranch className="h-3 w-3" />}{it.texto}</p>
          ) : it.k === "midia" ? (
            <div key={i} className="flex"><div className={balao}>
              {it.tipo === "imagem" && it.url ? <img src={it.url} alt="" className="mb-1 max-h-60 w-full rounded-md object-cover" /> : <p className="mb-1 rounded-md bg-black/20 px-2 py-3 text-xs text-white/60">[{it.tipo}]</p>}
              {it.texto && <p className="whitespace-pre-wrap">{it.texto}</p>}<Hora h={it.h} /></div></div>
          ) : (
            <div key={i} className="space-y-1.5">
              {it.imagem && whatsapp && <div className="flex"><div className={balao}><img src={it.imagem} alt="" className="max-h-60 w-full rounded-md object-cover" /><Hora h={it.h} /></div></div>}
              {it.video && <div className="flex"><div className={balao}><video src={it.video} controls preload="metadata" className="max-h-60 w-full rounded-md" /><Hora h={it.h} /></div></div>}
              <div className="flex"><div className={balao}>
                {it.imagem && !whatsapp && <img src={it.imagem} alt="" className="mb-1 max-h-60 w-full rounded-md object-cover" />}
                <p className="whitespace-pre-wrap">{it.texto || <span className="text-white/35">(mensagem vazia)</span>}
                  {whatsapp && it.respostas.length > 0 && !(it.respostas.length >= 2 && it.respostas.length <= 12) && `\n\n${it.respostas.map((r, n) => `${n + 1}) ${r.titulo}`).join("\n")}\n\nResponda com o número.`}
                  {whatsapp && it.links.length > 0 && <>{"\n\n"}{it.links.map((l, j) => <span key={j} className="block">{l.titulo}: <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-[#53bdeb] underline">{l.url}</a></span>)}</>}</p>
                {!whatsapp && it.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center justify-center gap-1.5 rounded-md border-t border-white/10 px-2 py-1.5 text-xs text-[#53bdeb]"><Link2 className="h-3 w-3" />{l.titulo}</a>)}
                <Hora h={it.h} /></div></div>
              {i === idxUltimaMsg && enquete && espera?.tipo === "resposta" && (
                <div className="flex"><div className={cn(balao, "w-[85%]")}>
                  <p className="font-medium">Toque para escolher 👇</p><p className="mb-1.5 flex items-center gap-1 text-[11px] text-white/50"><Check className="h-3 w-3" />Selecione uma opção</p>
                  <div className="space-y-2.5 pb-1">{respostasDoNo(espera.no).map((b) => {
                    const marcado = voto === b.id;
                    return (<button key={b.id} type="button" disabled={!!voto} onClick={() => votar(espera.no, b)} className="block w-full text-left">
                      <div className="flex items-center gap-2.5"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", marcado ? "border-[#00a884] bg-[#00a884]" : "border-white/40")}>{marcado && <Check className="h-3 w-3 text-black" />}</span>
                        <span className="min-w-0 flex-1">{b.titulo}</span><span className="text-xs text-white/60">{marcado ? 1 : 0}</span></div>
                      <div className="ml-[30px] mt-1 h-1 rounded-full bg-white/10"><div className={cn("h-1 rounded-full bg-[#00a884] transition-all duration-500", marcado ? "w-full" : "w-0")} /></div></button>);
                  })}</div>
                  <div className="-mx-2 mt-1 border-t border-white/10 pt-1.5 text-center text-[13px] font-medium text-[#00a884]">Mostrar votos</div><Hora h={it.h} /></div></div>)}
              {i === idxUltimaMsg && !whatsapp && espera?.tipo === "resposta" && (
                <div className="flex flex-wrap gap-1.5">{respostasDoNo(espera.no).map((b) => (<button key={b.id} type="button" onClick={() => seguir(espera.no, b.id, b.titulo)} className="rounded-full border border-[#53bdeb]/50 px-3 py-1.5 text-xs text-[#53bdeb] hover:bg-white/5">{b.titulo || "Botão"}</button>))}</div>)}
            </div>))}
          {espera?.tipo === "tempo" && <Button type="button" size="sm" onClick={() => seguir(espera.no, "proximo")} className="mx-auto flex bg-amber-400 text-black hover:bg-amber-300"><Clock className="mr-1.5 h-3.5 w-3.5" />Pular a espera</Button>}
          {espera?.tipo === "condicao" && (
            <div className="mx-auto w-[88%] space-y-1.5 rounded-lg bg-[#182229] p-2.5"><p className="flex items-center gap-1.5 text-xs text-fuchsia-200"><GitBranch className="h-3.5 w-3.5" />Condição: {condicaoTexto(espera.no)}</p>
              <div className="grid grid-cols-2 gap-1.5"><Button type="button" size="sm" variant="outline" onClick={() => seguir(espera.no, "sim", "Sim")} className="border-white/20 bg-transparent text-white hover:bg-white/10">Sim</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => seguir(espera.no, "nao", "Não")} className="border-white/20 bg-transparent text-white hover:bg-white/10">Não</Button></div></div>)}
          {espera?.tipo === "resposta" && <button type="button" onClick={() => seguir(espera.no, "outro", "(outra resposta)")} className="mx-auto block rounded-full bg-[#182229] px-3 py-1 text-[11px] text-[#8696a0] hover:bg-[#202c33]">Responder outra coisa (texto livre)</button>}
          <div ref={fim} />
        </div>
        <form className="flex items-center gap-2 bg-[#0b141a] px-2 py-2" onSubmit={(e) => { e.preventDefault(); if (espera?.tipo === "resposta" && texto.trim()) responder(espera.no, texto); }}>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#202c33] px-3 py-2"><Smile className="h-5 w-5 shrink-0 text-[#8696a0]" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!lista && !(espera?.tipo === "resposta")} placeholder={espera?.tipo === "resposta" ? "Mensagem" : "Nada a responder agora"} className="min-w-0 flex-1 bg-transparent text-[15px] text-[#e9edef] outline-none placeholder:text-[#8696a0] disabled:opacity-50" />
            <Plus className="h-5 w-5 shrink-0 text-[#8696a0]" /><Camera className="h-5 w-5 shrink-0 text-[#8696a0]" /></div>
          <button type="submit" disabled={espera?.tipo !== "resposta" || !texto.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-black disabled:opacity-80">{texto.trim() ? <Send className="h-4 w-4" /> : <Mic className="h-5 w-5" />}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
