import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface JarvisNotificationAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
}

interface JarvisNotificationCardProps {
  titulo?: string;
  children?: ReactNode;
  acoes?: JarvisNotificationAction[];
  tone?: "info" | "success";
  /** Balão de diálogo saindo da lua da pessoa (no topo da órbita, logo abaixo do card) — 16/10. */
  fala?: boolean;
  /** Shirley brava (16/10): borda vermelha e o balão "chacoalha". */
  bravo?: boolean;
}

// Componente único para TODAS as notificações espontâneas do Atlas (rodada
// 8, item 1C) — mensagem motivacional, nova hora, overtime, possível
// distração, lembrete, pausa, retorno ao foco.
//
// Rodada 12: o card deixou de ser um retângulo FIXO de 380x230 — pra uma
// mensagem curta (ex.: bolha motivacional, sem título/botões), isso sobrava
// quase todo vazio, dando a impressão de "bug" (rodada 11) mesmo já
// centralizado verticalmente. Agora o card abraça o próprio conteúdo
// (`w-fit`/altura automática), sempre dentro de limites seguros — largura
// entre 240 e 340px, altura até 170px — então nunca fica maluco pequeno
// (o bug original, várias rodadas atrás, era largura *indefinida*, não
// isso) nem estoura o espaço reservado pra ele dentro da janela de
// notificação (380x360 — ver TAMANHOS em desktop/window.ts, que sobra
// altura de propósito pra caber o card EM CIMA da orbe, ainda visível
// abaixo dele — ver Assistant.tsx). `box-border` pra padding não somar por
// cima dos limites.
export function JarvisNotificationCard({ titulo, children, acoes, tone = "info", fala, bravo }: JarvisNotificationCardProps) {
  const card = (
    <div
      role="status"
      className={cn(
        "box-border flex max-h-[170px] w-fit min-w-[240px] max-w-[340px] flex-col overflow-hidden rounded-xl border shadow-lg",
        "animate-in fade-in-0 slide-in-from-bottom-1 zoom-in-95",
        tone === "success" ? "border-emerald-400/40 bg-popover text-popover-foreground" : "border-border bg-popover text-popover-foreground",
        bravo && "border-2 border-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.45)] animate-shake",
      )}
    >
      <div className="min-h-0 overflow-y-auto px-4 py-3">
        {titulo && <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{titulo}</p>}
        {children && <div className={cn("whitespace-normal break-words text-sm text-muted-foreground", titulo && "mt-1")}>{children}</div>}
      </div>
      {acoes && acoes.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
          {acoes.map((acao) => (
            <Button
              key={acao.label}
              type="button"
              size="sm"
              variant={acao.variant ?? "outline"}
              className="min-w-[110px] flex-1"
              onClick={acao.onClick}
            >
              {acao.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
  if (!fala) return card;
  // Rabinho do balão apontando para a lua que está "falando" (no topo da órbita, sobre o centro da orbe:
  // 32px da borda direita do card, que fica alinhado à orbe).
  return (
    <div className="relative">
      {card}
      <span aria-hidden="true" className={cn("absolute -bottom-1.5 right-[26px] h-3 w-3 rotate-45 border-b border-r bg-popover",
        tone === "success" ? "border-emerald-400/40" : "border-border")} />
    </div>
  );
}
