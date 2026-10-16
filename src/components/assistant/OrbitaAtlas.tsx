import { cn } from "@/lib/utils";
import { CabecaBoneco } from "@/components/empresa/BonecoMesa";

// "O Sistema Solar do Atlas" (pedido do Davi, 16/10/2026): quem precisa dele
// gira em volta da orbe, com o rosto da pessoa da equipe e a cor do motivo —
// amarelo = WhatsApp esperando (Shirley), vermelho pulsando = urgente (cliente
// insatisfeito, erro), verde = entrega para revisar, azul = respondeu no chat.
// Clicar numa lua mostra o que é e por quê (balão), com o botão da ação.
// Cabe na janela da orbe (140×140): raio 52px em volta da face de 64px.
export type CorLua = "whatsapp" | "urgente" | "revisar" | "resposta";
// Clicar na lua mostra o que é e por que ela apareceu (16/10), com o botão da ação.
export interface Lua {
  id: string; nome: string; ehIa: boolean; cor: CorLua; dica: string; onClick: () => void;
  titulo: string; porque: string; trecho?: string; acaoRotulo: string; acao: () => void;
}

const ANEL: Record<CorLua, string> = {
  whatsapp: "ring-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]",
  urgente: "ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-pulse",
  revisar: "ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
  resposta: "ring-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]",
};
const RAIO = 52;

export function OrbitaAtlas({ luas, falandoId }: { luas: Lua[]; falandoId?: string | null }) {
  if (!luas.length) return null;
  // Paradas (16/10: "o rosto nem precisa ficar girando, só aparecer na órbita"): a primeira no topo
  // (de onde sai o balão dela), as outras seguindo para a esquerda, 40° uma da outra.
  const visiveis = [...luas].sort((a, b) => (a.id === falandoId ? -1 : b.id === falandoId ? 1 : 0)).slice(0, 6);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" aria-label="Quem precisa de você">
      <div className="absolute rounded-full border border-dashed border-cyan-300/25" style={{ width: RAIO * 2, height: RAIO * 2, left: -RAIO, top: -RAIO }} />
      {visiveis.map((l, i) => {
        const ang = ((-90 - 40 * i) * Math.PI) / 180;
        return (
          <button key={l.id} type="button" title={l.dica} aria-label={l.dica} onClick={l.onClick}
            className={cn("pointer-events-auto absolute h-[22px] w-[22px] overflow-hidden rounded-full bg-slate-900 ring-2 transition-transform animate-in fade-in-0 zoom-in-50 duration-300 hover:scale-125",
              ANEL[l.cor], l.id === falandoId && "scale-125")}
            style={{ left: Math.cos(ang) * RAIO - 11, top: Math.sin(ang) * RAIO - 11 }}>
            <CabecaBoneco nome={l.nome} ehIa={l.ehIa} className="h-full w-full" />
          </button>
        );
      })}
    </div>
  );
}
