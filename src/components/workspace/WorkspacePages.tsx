import { Route, Routes } from "react-router-dom";
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
export function WorkspacePages() {
  const { tabs, activeId } = useWorkspaceTabs();
  return <>
    {tabs.map((tab) => {
      const [pathname, search = ""] = tab.path.split("?");
      return <div key={tab.id} className={tab.id === activeId ? "contents" : "hidden"}>
        {/* A página ocupa a janela toda, mas nunca menos que 720px nem menos
            que o conteúdo precisa (w-fit = largura mínima do conteúdo, ex.: a
            semana da Agenda). Se não couber, o <main> do layout rola pro lado. */}
        <div className={cn("w-fit min-w-[max(720px,100%)]", isClienteDetalhePath(pathname) ? "" : "p-3 sm:p-6")}>
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
      </div>;
    })}
  </>;
}
