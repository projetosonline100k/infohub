import { AlarmClock, BellOff, Check, TimerReset } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcaoAlarme, PedidoAlarme } from "@/lib/desktop/alarmeAtlas";

// O alarme no Atlas (18/10/2026): grande, pulsando, por cima de tudo, até o Davi escolher.
export function AlarmeAtlasCard({ alarme, onResponder }: { alarme: PedidoAlarme; onResponder: (a: AcaoAlarme) => void }) {
  return (
    <div className="pointer-events-auto relative w-[330px] overflow-hidden rounded-2xl border border-amber-400/60 bg-slate-950/95 p-4 text-white shadow-[0_0_40px_rgba(251,191,36,0.35)]">
      <span aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 animate-ping rounded-full bg-amber-400/20 [animation-duration:1.6s]" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 animate-shake items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.8)]">
          <AlarmClock className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Alarme</p>
          <p className="text-lg font-bold leading-tight">{alarme.titulo}</p>
          <p className="mt-0.5 text-xs text-slate-300">{alarme.descricao}</p>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onResponder("parar")}
          className={cn("flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300", alarme.podeConcluir && "col-span-2")}>
          <BellOff className="h-4 w-4" />Parar
        </button>
        <button type="button" onClick={() => onResponder("soneca")}
          className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/20 px-3 py-2.5 text-sm font-semibold hover:bg-white/10">
          <TimerReset className="h-4 w-4" />Soneca 5 min
        </button>
        {alarme.podeConcluir && (
          <button type="button" onClick={() => onResponder("concluir")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/50 px-3 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10">
            <Check className="h-4 w-4" />Concluir
          </button>
        )}
      </div>
    </div>
  );
}
