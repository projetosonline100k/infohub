import { cn } from "@/lib/utils";
import { CabecaBoneco } from "@/components/empresa/BonecoMesa";

// "O Sistema Solar do Atlas" (pedido do Davi, 16/10/2026): quem precisa dele
// gira em volta da orbe, com o rosto da pessoa da equipe e a cor do motivo —
// amarelo = WhatsApp esperando (Shirley), vermelho pulsando = urgente (cliente
// insatisfeito, erro), verde = entrega para revisar, azul = respondeu no chat.
// Clicar numa lua faz a ação dela (abrir o WhatsApp, a entrega, a conversa).
// Cabe na janela da orbe (140×140): raio 52px em volta da face de 64px.
export type CorLua = "whatsapp" | "urgente" | "revisar" | "resposta";
export interface Lua { id: string; nome: string; ehIa: boolean; cor: CorLua; dica: string; onClick: () => void }

const ANEL: Record<CorLua, string> = {
  whatsapp: "ring-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]",
  urgente: "ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-pulse",
  revisar: "ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
  resposta: "ring-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]",
};
const RAIO = 52;
const VOLTA_S = 40;   // uma volta a cada 40 s: movimento calmo, não distrai

export function OrbitaAtlas({ luas }: { luas: Lua[] }) {
  if (!luas.length) return null;
  const visiveis = luas.slice(0, 6);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" aria-label="Quem precisa de você">
      {/* Trilha da órbita */}
      <div className="absolute rounded-full border border-dashed border-cyan-300/25" style={{ width: RAIO * 2, height: RAIO * 2, left: -RAIO, top: -RAIO }} />
      <div className="absolute left-0 top-0 h-0 w-0" style={{ animation: `spin ${VOLTA_S}s linear infinite` }}>
        {visiveis.map((l, i) => {
          const ang = (i / visiveis.length) * 2 * Math.PI - Math.PI / 2;
          return (
            <div key={l.id} className="absolute" style={{ left: Math.cos(ang) * RAIO - 11, top: Math.sin(ang) * RAIO - 11 }}>
              {/* Gira ao contrário: o rosto fica sempre em pé. */}
              <button type="button" title={l.dica} aria-label={l.dica} onClick={l.onClick}
                className={cn("pointer-events-auto h-[22px] w-[22px] overflow-hidden rounded-full bg-slate-900 ring-2 transition-transform hover:scale-125", ANEL[l.cor])}
                style={{ animation: `spin ${VOLTA_S}s linear infinite reverse` }}>
                <CabecaBoneco nome={l.nome} ehIa={l.ehIa} className="h-full w-full" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
