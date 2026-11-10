import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { falaDoBot, respostaDeExemplo, type ConfigChatbot } from "@/lib/chatbot/chatbot";

// Prévia "ao vivo" (10/11/2026, Davi: "quando eu estiver escrevendo algo, já mostre no chat"): sem esperar nem
// digitar, mostra a conversa até a etapa escolhida (ou até um dos finais) com respostas de exemplo, e muda a cada
// letra que se escreve no editor. O teste de verdade, clicando e respondendo, é o modo "Testar".
export function PreviaChatbot({ config, foco }: { config: ConfigChatbot; foco: string }) {
  const cor = config.marca.cor || "#7c3aed";
  const final = foco === "final-qualificado" ? "qualificado" : foco === "final-nao_qualificado" ? "nao_qualificado" : null;
  const indice = final ? config.etapas.length : Math.max(0, config.etapas.findIndex((e) => e.id === foco));
  const dados: Record<string, string> = {};
  const linhas: { lado: "bot" | "user" | "botao"; html: string; atual?: boolean }[] = [];
  config.etapas.forEach((e, i) => {
    if (i > indice) return;
    const resposta = respostaDeExemplo(e);
    e.mensagens.forEach((m) => linhas.push({ lado: "bot", html: falaDoBot(m, dados), atual: i === indice && !final }));
    if (i < indice && resposta) { dados[e.chave] = resposta; linhas.push({ lado: "user", html: falaDoBot(resposta.replace(/[{}]/g, ""), {}) }); }
    else if (resposta && final) dados[e.chave] = resposta;
  });
  if (final) {
    // as respostas de exemplo da última etapa também entram nas variáveis do final
    const d = config.desfechos[final];
    d.mensagens.forEach((m) => linhas.push({ lado: "bot", html: falaDoBot(m, dados), atual: true }));
    if (d.botao_texto) linhas.push({ lado: "botao", html: d.botao_texto });
  }
  const etapa = final ? null : config.etapas[indice];
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); });
  const avatar = config.marca.avatar_url || config.marca.logo_url;
  const total = config.etapas.filter((e) => e.tipo !== "nenhum").length;
  const feitas = config.etapas.slice(0, indice).filter((e) => e.tipo !== "nenhum").length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7fb] text-neutral-900">
      <header className="shrink-0 border-b bg-white">
        <div className="flex items-center gap-2 px-4 py-2.5">
          {config.marca.logo_url ? <img src={config.marca.logo_url} alt="" className="h-7 w-auto rounded" />
            : <span className="flex h-7 min-w-7 items-center justify-center rounded bg-neutral-900 px-1.5 text-[10px] font-bold text-white">{config.marca.titulo.slice(0, 2).toUpperCase()}</span>}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-700">{config.marca.subtitulo || config.marca.titulo}</span>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}1f`, color: cor }}>{final ? total : feitas} de {total}</span>
        </div>
        <div className="h-[3px] bg-neutral-100"><i className="block h-full" style={{ width: `${total ? ((final ? total : feitas) / total) * 100 : 0}%`, background: cor }} /></div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1.5">
          {linhas.map((l, i) => l.lado === "botao" ? (
            <span key={i} className="ml-10 mt-2 inline-flex w-fit rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-md" style={{ background: cor }}>{l.html}</span>
          ) : l.lado === "bot" ? (
            <div key={i} className="flex items-end gap-2">
              {linhas[i - 1]?.lado === "bot" ? <span className="w-8 shrink-0" /> : (
                <span className="mb-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-900">
                  {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white">{config.marca.titulo.slice(0, 1)}</span>}
                </span>
              )}
              <div className={`max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm ${l.atual ? "ring-2" : ""}`} style={l.atual ? { ["--tw-ring-color" as string]: `${cor}66` } : undefined} dangerouslySetInnerHTML={{ __html: l.html }} />
            </div>
          ) : (
            <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[14px] text-white shadow-sm" style={{ background: cor }} dangerouslySetInnerHTML={{ __html: l.html }} /></div>
          ))}
          <div ref={fim} />
        </div>
      </main>
      <footer className="shrink-0 border-t bg-white px-3 pb-3 pt-2">
        {etapa?.tipo === "escolha" && (
          <div className="flex flex-wrap gap-2">{(etapa.opcoes ?? []).map((o, i) => <span key={i} className="rounded-full border bg-white px-4 py-2 text-sm font-medium" style={{ borderColor: `${cor}66`, color: cor }}>{o.texto}</span>)}</div>
        )}
        {etapa && (etapa.tipo === "texto" || etapa.tipo === "whatsapp" || etapa.tipo === "email" || etapa.tipo === "lista") && (
          <div>
            {etapa.rotulo && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{etapa.rotulo}</p>}
            <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate py-1.5 text-[15px] text-neutral-400">{etapa.tipo === "lista" ? (etapa.opcoes?.[0]?.texto ?? "") : etapa.placeholder}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }}><ArrowUp className="h-4 w-4" /></span>
            </div>
          </div>
        )}
        {config.lgpd && <p className="mt-2 text-center text-[10px] leading-snug text-neutral-400">{config.lgpd}</p>}
      </footer>
    </div>
  );
}
