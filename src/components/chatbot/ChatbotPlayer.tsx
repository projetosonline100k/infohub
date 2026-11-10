import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  desfechoDe, falaDoBot, formatarWhatsapp, pontuar, sugerirEmail, validarResposta,
  type ConfigChatbot, type EtapaChatbot,
} from "@/lib/chatbot/chatbot";

// A conversa do chatbot (10/11/2026): o mesmo componente roda na página pública /chatbot/<slug> e na prévia do
// editor. O bot "digita" (três pontinhos), fala, e embaixo fica o campo da resposta (texto, botões ou lista).
interface Linha { id: number; lado: "bot" | "user" | "botao"; html?: string; botao?: { texto: string; url: string } }
type Entrada =
  | { tipo: "texto" | "whatsapp" | "email"; etapa: EtapaChatbot }
  | { tipo: "escolha" | "lista"; etapa: EtapaChatbot }
  | { tipo: "confirmar-email"; etapa: EtapaChatbot; sugestao: string; original: string }
  | null;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ChatbotPlayer({ config, onProgresso, rapido = false }: {
  config: ConfigChatbot;
  /** chamado a cada resposta e no fim: salva o lead (na página pública) */
  onProgresso?: (p: { dados: Record<string, string>; etapa: number; score: number; desfecho: string | null }) => void;
  rapido?: boolean;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [entrada, setEntrada] = useState<Entrada>(null);
  const [passo, setPasso] = useState(0);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState("");
  const dados = useRef<Record<string, string>>({});
  const vivo = useRef(true);
  const contador = useRef(0);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const onProgressoRef = useRef(onProgresso);
  onProgressoRef.current = onProgresso;
  const total = config.etapas.filter((e) => e.tipo !== "nenhum").length;

  const falar = useCallback(async (texto: string) => {
    setDigitando(true);
    await espera(rapido ? 250 : Math.min(1400, 600 + texto.length * 6));
    if (!vivo.current) return;
    setDigitando(false);
    setLinhas((l) => [...l, { id: ++contador.current, lado: "bot", html: falaDoBot(texto, dados.current) }]);
  }, [rapido]);
  const usuario = (texto: string) => setLinhas((l) => [...l, { id: ++contador.current, lado: "user", html: falaDoBot(texto.replace(/[{}]/g, ""), {}) }]);

  const terminar = useCallback(async () => {
    const score = pontuar(config, dados.current);
    const qual = desfechoDe(config, score);
    const d = config.desfechos[qual];
    onProgressoRef.current?.({ dados: { ...dados.current }, etapa: config.etapas.length, score, desfecho: qual });
    for (const m of d.mensagens) { await falar(m); if (!vivo.current) return; }
    if (d.botao_texto && d.botao_url) setLinhas((l) => [...l, { id: ++contador.current, lado: "botao", botao: { texto: d.botao_texto!, url: d.botao_url! } }]);
  }, [config, falar]);

  const irPara = useCallback(async (i: number) => {
    if (i >= config.etapas.length) { setEntrada(null); await terminar(); return; }
    const etapa = config.etapas[i];
    setPasso(i);
    setEntrada(null);
    for (const m of etapa.mensagens) { await falar(m); if (!vivo.current) return; }
    if (etapa.tipo === "nenhum") { await irPara(i + 1); return; }
    setValor(""); setErro(null); setSelecionado(etapa.opcoes?.[0]?.texto ?? "");
    setEntrada({ tipo: etapa.tipo, etapa });
    setTimeout(() => campo.current?.focus(), 50);
  }, [config.etapas, falar, terminar]);

  useEffect(() => {
    vivo.current = true;
    dados.current = {};
    setLinhas([]);
    void irPara(0);
    return () => { vivo.current = false; };
    // recomeça só quando o chatbot muda de verdade (a prévia usa key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [linhas.length, digitando, entrada]);

  const responder = async (etapa: EtapaChatbot, resposta: string, mostrar?: string) => {
    usuario(mostrar ?? resposta);
    dados.current = { ...dados.current, [etapa.chave]: resposta };
    const i = config.etapas.indexOf(etapa);
    onProgressoRef.current?.({ dados: { ...dados.current }, etapa: i + 1, score: pontuar(config, dados.current), desfecho: null });
    setEntrada(null);
    await irPara(i + 1);
  };

  const enviarTexto = async () => {
    if (!entrada || entrada.tipo === "escolha" || entrada.tipo === "lista" || entrada.tipo === "confirmar-email") return;
    const { etapa } = entrada;
    const v = entrada.tipo === "whatsapp" ? formatarWhatsapp(valor) : valor.trim();
    const e = validarResposta(entrada.tipo, v, etapa.chave);
    if (e) { setErro(e); return; }
    if (entrada.tipo === "email") {
      const s = sugerirEmail(v);
      if (s) { usuario(v); await falar(`Hmm, esse e-mail parece ter um errinho de digitação. Você quis dizer **${s}**?`); setEntrada({ tipo: "confirmar-email", etapa, sugestao: s, original: v }); return; }
    }
    await responder(etapa, etapa.chave === "instagram" ? `${v.replace(/^@/, "")}` : v, etapa.chave === "instagram" ? `@${v.replace(/^@/, "")}` : v);
  };

  const cor = config.marca.cor || "#7c3aed";
  const avatar = config.marca.avatar_url || config.marca.logo_url;
  const Avatar = () => (
    <span className="mb-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-900">
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white">{config.marca.titulo.slice(0, 1)}</span>}
    </span>
  );
  const andamento = Math.min(config.etapas.slice(0, passo).filter((e) => e.tipo !== "nenhum").length, total);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7fb] text-neutral-900" style={{ ["--cb" as string]: cor }}>
      <header className="shrink-0 border-b bg-white">
        <div className="flex items-center gap-2 px-4 py-2.5">
          {config.marca.logo_url
            ? <img src={config.marca.logo_url} alt="" className="h-7 w-auto rounded" />
            : <span className="flex h-7 min-w-7 items-center justify-center rounded bg-neutral-900 px-1.5 text-[10px] font-bold text-white">{config.marca.titulo.slice(0, 2).toUpperCase()}</span>}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-700">{config.marca.subtitulo || config.marca.titulo}</span>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}1f`, color: cor }}>{andamento} de {total}</span>
        </div>
        <div className="h-[3px] bg-neutral-100"><i className="block h-full transition-all duration-500" style={{ width: `${total ? (andamento / total) * 100 : 0}%`, background: cor }} /></div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-xl flex-col gap-1.5">
          {linhas.map((l, i) => {
            const anterior = linhas[i - 1]?.lado;
            if (l.lado === "botao" && l.botao) {
              return <a key={l.id} href={l.botao.url} target="_blank" rel="noreferrer" className="ml-10 mt-2 inline-flex w-fit items-center rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-md" style={{ background: cor }}>{l.botao.texto}</a>;
            }
            return l.lado === "bot" ? (
              <div key={l.id} className="flex items-end gap-2">
                {anterior === "bot" ? <span className="w-8 shrink-0" /> : <Avatar />}
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm" dangerouslySetInnerHTML={{ __html: l.html ?? "" }} />
              </div>
            ) : (
              <div key={l.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[14px] text-white shadow-sm" style={{ background: cor }} dangerouslySetInnerHTML={{ __html: l.html ?? "" }} />
              </div>
            );
          })}
          {digitando && (
            <div className="flex items-end gap-2"><Avatar />
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm">{[0, 1, 2].map((n) => <i key={n} className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: cor, opacity: 0.6, animationDelay: `${n * 150}ms` }} />)}</div>
            </div>
          )}
          <div ref={fim} />
        </div>
      </main>

      <footer className="shrink-0 border-t bg-white px-3 pb-3 pt-2">
        <div className="mx-auto max-w-xl">
          {entrada && (entrada.tipo === "texto" || entrada.tipo === "whatsapp" || entrada.tipo === "email") && (
            <form onSubmit={(e) => { e.preventDefault(); void enviarTexto(); }}>
              {entrada.etapa.rotulo && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{entrada.etapa.rotulo}</p>}
              <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-1.5 focus-within:ring-2" style={{ ["--tw-ring-color" as string]: `${cor}55` }}>
                <input ref={campo} value={valor} autoComplete="off" inputMode={entrada.tipo === "whatsapp" ? "tel" : entrada.tipo === "email" ? "email" : "text"}
                  onChange={(e) => { setValor(entrada.tipo === "whatsapp" ? formatarWhatsapp(e.target.value) : e.target.value); setErro(null); }}
                  placeholder={entrada.etapa.placeholder} className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none" />
                <button type="submit" aria-label="Enviar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }}><ArrowUp className="h-4 w-4" /></button>
              </div>
              {erro && <p className="mt-1 text-xs text-rose-600">{erro}</p>}
            </form>
          )}
          {entrada?.tipo === "escolha" && (
            <div className="flex flex-wrap gap-2">
              {(entrada.etapa.opcoes ?? []).map((o) => (
                <button key={o.texto} type="button" onClick={() => void responder(entrada.etapa, o.texto)}
                  className="rounded-full border bg-white px-4 py-2 text-sm font-medium transition-colors hover:text-white" style={{ borderColor: `${cor}66`, color: cor }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = cor; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = cor; }}>{o.texto}</button>
              ))}
            </div>
          )}
          {entrada?.tipo === "lista" && (
            <div>
              {entrada.etapa.rotulo && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{entrada.etapa.rotulo}</p>}
              <div className="flex items-center gap-2">
                <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} className="min-w-0 flex-1 rounded-2xl border bg-white px-3 py-3 text-[15px] outline-none">
                  {(entrada.etapa.opcoes ?? []).map((o) => <option key={o.texto}>{o.texto}</option>)}
                </select>
                <button type="button" aria-label="Confirmar" onClick={() => void responder(entrada.etapa, selecionado)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }}><ArrowUp className="h-4 w-4" /></button>
              </div>
            </div>
          )}
          {entrada?.tipo === "confirmar-email" && (
            <div className="flex flex-wrap gap-2">
              {[[`Sim, usar ${entrada.sugestao}`, entrada.sugestao], ["Não, está certo", entrada.original]].map(([rot, val]) => (
                <button key={rot} type="button" onClick={() => void responder(entrada.etapa, val, rot)} className={cn("rounded-full border px-4 py-2 text-sm font-medium")} style={{ borderColor: `${cor}66`, color: cor }}>{rot}</button>
              ))}
            </div>
          )}
          {config.lgpd && <p className="mt-2 text-center text-[10px] leading-snug text-neutral-400">{config.lgpd}</p>}
        </div>
      </footer>
    </div>
  );
}
