import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Aviso no meio do editor enquanto o Danilo mexe na edição (17/11/2026, Davi: "quando o Danilo estiver fazendo uma alteração, quero que apareça uma animação
// no meio da tela, tipo 'Danilo trabalhando', e a barra carregando, para eu não precisar sair para ver como está o andamento"). Não bloqueia: dá para
// continuar olhando o vídeo. A barra usa a porcentagem quando ela aparece no texto ("… 40%"); sem ela, é uma estimativa que vai enchendo e nunca passa de 92%.
const percentualDoTexto = (t: string | null) => { const m = /(\d{1,3})\s*%/.exec(t ?? ""); return m ? Math.min(100, Number(m[1])) : null; };

export function DaniloTrabalhando({ ativo, texto, desde }: { ativo: boolean; texto: string | null; desde?: string | null }) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) { setInicio(null); return; }
    setInicio((i) => i ?? (desde ? new Date(desde).getTime() : Date.now()));
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ativo, desde]);
  if (!ativo || inicio == null) return null;
  const seg = Math.max(0, Math.round((agora - inicio) / 1000));
  const real = percentualDoTexto(texto);
  const estimado = Math.min(92, Math.round(92 * (1 - Math.exp(-seg / 150))));
  const pct = real ?? estimado;
  const tempo = seg < 60 ? `${seg}s` : `${Math.floor(seg / 60)} min ${String(seg % 60).padStart(2, "0")}s`;
  return (
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
      <div className="w-[min(380px,86%)] rounded-3xl border border-cyan-300/30 bg-[#08121c]/90 p-5 text-center text-white shadow-[0_0_60px_rgba(34,211,238,0.25)] backdrop-blur-md animate-in fade-in-0 zoom-in-95">
        <div className="relative mx-auto grid h-[84px] w-[84px] place-items-center">
          <span className="absolute inset-0 rounded-full bg-cyan-400/25" style={{ animation: "lauro-onda 2s ease-out infinite" }} />
          <span className="absolute inset-0 rounded-full bg-cyan-400/25" style={{ animation: "lauro-onda 2s ease-out 1s infinite" }} />
          <span className="absolute -inset-1.5 rounded-full border-[3px] border-transparent border-t-cyan-300 border-r-cyan-300/60 shadow-[0_0_22px_rgba(103,232,249,0.65)]" style={{ animation: "lauro-gira 1.1s linear infinite" }} />
          <span className="relative grid h-[68px] w-[68px] place-items-center rounded-full border-2 border-cyan-300/80 bg-[#0c1b27]">
            <span className="flex gap-2"><span className="h-3 w-3 rounded-full bg-cyan-300" style={{ animation: "lauro-pisca 3s ease-in-out infinite" }} /><span className="h-3 w-3 rounded-full bg-cyan-300" style={{ animation: "lauro-pisca 3s ease-in-out infinite" }} /></span>
          </span>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-base font-bold"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />Danilo trabalhando…</p>
        {texto && <p className="mt-1 line-clamp-2 text-xs text-white/65">{texto}</p>}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width] duration-1000" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/50"><span>{real != null ? `${pct}%` : `~${pct}% (estimativa)`}</span><span>{tempo}</span></p>
      </div>
    </div>
  );
}
