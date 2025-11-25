import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import DashGeral from "./pages/DashGeral";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import Atividades from "./pages/Atividades";
import FormularioPublico from "./pages/FormularioPublico";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public route without layout */}
          <Route path="/formulario/:slug" element={<FormularioPublico />} />
          
          {/* Protected routes with layout */}
          <Route path="/" element={<DashboardLayout><DashGeral /></DashboardLayout>} />
          <Route path="/clientes" element={<DashboardLayout><Clientes /></DashboardLayout>} />
          <Route path="/clientes/:id" element={<DashboardLayout><ClienteDetalhe /></DashboardLayout>} />
          <Route path="/atividades" element={<DashboardLayout><Atividades /></DashboardLayout>} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<DashboardLayout><NotFound /></DashboardLayout>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
