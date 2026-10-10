import { useRef } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import DashGeral from "@/pages/DashGeral";
import Clientes from "@/pages/Clientes";
import ClienteDetalhe from "@/pages/ClienteDetalhe";
import Atividades from "@/pages/Atividades";
import Notas from "@/pages/Notas";
import Produtividade from "@/pages/Produtividade";
import Agenda from "@/pages/Agenda";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/NotFound";
import { useWorkspaceTabs } from "./WorkspaceTabs";

const isClienteDetalhePath = (path: string) => /^\/clientes\/[^/?]+/.test(path);

// Cada aba mantém sua própria página montada (keep-alive): trocar de aba
// só esconde/mostra, sem recarregar dados nem misturar estado entre abas.
// `<Routes location>` faz useLocation/useParams/useSearchParams dentro da
// aba enxergarem o caminho DELA, não o da barra de endereço.
//
// Visualização dividida: com a guia ativa num par dividido, as duas guias do
// par aparecem lado a lado (esquerda/direita fixas, divisória arrastável).
// Todas as guias ficam sempre como filhas do MESMO container — só muda o
// estilo — pra nenhuma página ser desmontada ao dividir ou desfazer.
export function WorkspacePages() {
  const { tabs, activeId, divisao, larguras, moverDivisoria, igualarLarguras, focarGuia } = useWorkspaceTabs();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const dividido = !!divisao && divisao.includes(activeId);

  const arrastarDivisoria = (indice: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const caixa = containerRef.current?.getBoundingClientRect();
    if (!caixa) return;
    const mover = (ev: PointerEvent) => moverDivisoria(indice, (ev.clientX - caixa.left) / caixa.width);
    const soltar = () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      {tabs.map((tab) => {
        const [pathname, search = ""] = tab.path.split("?");
        // Posição do painel na tela dividida (0, 1, 2) ou -1.
        const indice = dividido ? divisao!.indexOf(tab.id) : -1;
        const lado = indice >= 0;
        const visivel = dividido ? lado : tab.id === activeId;
        return <div
          key={tab.id}
          // Clicou dentro da outra metade: ela vira a guia ativa (e a
          // navegação passa a valer pra ela).
          onPointerDownCapture={() => { if (lado && tab.id !== activeId) { focarGuia(tab.id); navigate(tab.path); } }}
          style={lado ? { order: indice * 2, width: `${(larguras[indice] ?? 1 / divisao!.length) * 100}%` } : undefined}
          // translateZ(0): vira a "moldura" das camadas `fixed` da página
          // (ex.: o editor de documento, que cobre a tela). Sem isso, numa
          // tela dividida o documento de uma metade tampava a janela toda.
          className={cn(
            "relative h-full min-h-0 min-w-0 [transform:translateZ(0)]",
            !visivel && "hidden",
            visivel && !lado && "flex-1",
            lado && tab.id === activeId && "after:pointer-events-none after:absolute after:inset-0 after:z-[60] after:ring-2 after:ring-inset after:ring-primary/40",
          )}
        >
          <div className="h-full overflow-auto">
          {/* A página ocupa a área toda, mas nunca menos que 720px (420px numa
              metade dividida) nem menos que o conteúdo precisa. Se não couber,
              a própria área rola pro lado. */}
          <div className={cn("w-fit", lado ? (divisao!.length >= 3 ? "min-w-[max(320px,100%)]" : "min-w-[max(420px,100%)]") : "min-w-[max(720px,100%)]", isClienteDetalhePath(pathname) ? "" : "p-3 sm:p-6")}>
            <Routes location={{ pathname, search: search ? `?${search}` : "", hash: "", state: null, key: tab.id }}>
              <Route path="/" element={<DashGeral />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/atividades" element={<Atividades />} />
              <Route path="/notas" element={<Notas />} />
              <Route path="/produtividade" element={<Produtividade />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          </div>
        </div>;
      })}
      {/* Uma divisória entre cada par de painéis vizinhos. */}
      {dividido && divisao!.slice(0, -1).map((_, i) => (
        <div
          key={`divisoria-${i}`}
          role="separator"
          aria-label="Arraste para mudar a largura das guias"
          onPointerDown={arrastarDivisoria(i)}
          onDoubleClick={igualarLarguras}
          title="Arraste para ajustar · clique duas vezes para deixar todas iguais"
          className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
          style={{ order: i * 2 + 1 }}
        >
          <span className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
        </div>
      ))}
    </div>
  );
}
