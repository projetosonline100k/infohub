import { Pause, Play, SkipForward, X } from "lucide-react";
import { useAssistantAtividades } from "@/hooks/useAssistantAtividades";
import { mmss, useFocoTimer } from "@/hooks/useFocoTimer";
import { desligarFocoTotal } from "@/lib/foco/focoTotal";

// Janelinha lateral do foco total (27/10): fica no canto da tela, por cima de tudo e em todas as áreas de
// trabalho, com o cronômetro, o foco atual e o botão de sair. Mesmo estado da página /foco.
export default function FocoLateral() {
  const { tarefas, atrasadas, iniciarTimer, pausarTimer } = useAssistantAtividades();
  const { estado, rodando, restante, total, focoHojeMin, tocar, pular, marcarTotal } =
    useFocoTimer({ iniciarTimer: (id) => iniciarTimer(id), pausarTimer: (id) => pausarTimer(id) });
  const tarefa = [...tarefas, ...atrasadas].find((t) => t.id === estado.tarefaId);
  const progresso = total ? 1 - restante / total : 0;
  const raio = 70, volta = 2 * Math.PI * raio;
  const sair = async () => { marcarTotal(false); await desligarFocoTotal(); };
  return (
    <div className="flex h-screen select-none flex-col bg-gradient-to-b from-[#1f3f73] to-[#16305a] px-4 pb-4 pt-8 text-white" data-tauri-drag-region>
      <div className="flex items-center justify-between text-[11px] text-white/70" data-tauri-drag-region>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold tracking-wider text-white">{estado.fase === "foco" ? "FOCO" : "PAUSA"}</span>
        <span>Hoje: {focoHojeMin} min</span>
      </div>
      <div className="relative mx-auto my-3 h-44 w-44">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={raio} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
          <circle cx="80" cy="80" r={raio} fill="none" stroke={estado.fase === "foco" ? "#7cc4ff" : "#7fe3b4"} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={volta} strokeDashoffset={volta * (1 - progresso)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums">{mmss(restante)}</span>
      </div>
      <p className="truncate text-center text-sm" title={tarefa?.titulo}>{tarefa?.titulo ?? "Sem tarefa específica"}</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={tocar} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3d7fe0] hover:bg-[#4b8cf0]" title={rodando ? "Pausar" : "Começar"}>
          {rodando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
        </button>
        <button type="button" onClick={pular} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" title="Pular"><SkipForward className="h-4 w-4" /></button>
      </div>
      <button type="button" onClick={() => void sair()} className="mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs hover:bg-rose-600">
        <X className="h-3.5 w-3.5" />Sair do foco total
      </button>
    </div>
  );
}
