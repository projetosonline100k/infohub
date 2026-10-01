import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import DashGeral from "./pages/DashGeral";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import Atividades from "./pages/Atividades";
import Notas from "./pages/Notas";
import Produtividade from "./pages/Produtividade";
import Agenda from "./pages/Agenda";
import Admin from "./pages/Admin";
import FormularioPublico from "./pages/FormularioPublico";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import RedefinirSenha from "./pages/RedefinirSenha";
import DocumentoCompartilhado from "./pages/DocumentoCompartilhado";
import JarvisWindow from "./pages/JarvisWindow";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { WorkspaceTabsProvider } from "@/components/workspace/WorkspaceTabs";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceTabsProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          {/* Public route without layout */}
          <Route path="/formulario/:slug" element={<FormularioPublico />} />
          <Route path="/compartilhado/:token" element={<DocumentoCompartilhado />} />

          {/* Janela nativa `jarvis` (desktop, ver src-tauri/tauri.conf.json) —
              sem DashboardLayout e sem ProtectedRoute (essa nunca redireciona
              pra /login: ver JarvisWindow.tsx). */}
          <Route path="/jarvis" element={<JarvisWindow />} />
          
          {/* Protected routes with layout */}
          <Route path="/" element={<ProtectedRoute><DashboardLayout><DashGeral /></DashboardLayout></ProtectedRoute>} />
          <Route path="/clientes" element={<ProtectedRoute><DashboardLayout><Clientes /></DashboardLayout></ProtectedRoute>} />
          <Route path="/clientes/:id" element={<ProtectedRoute><DashboardLayout><ClienteDetalhe /></DashboardLayout></ProtectedRoute>} />
          <Route path="/atividades" element={<ProtectedRoute><DashboardLayout><Atividades /></DashboardLayout></ProtectedRoute>} />
          <Route path="/notas" element={<ProtectedRoute><DashboardLayout><Notas /></DashboardLayout></ProtectedRoute>} />
          <Route path="/produtividade" element={<ProtectedRoute><DashboardLayout><Produtividade /></DashboardLayout></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute><DashboardLayout><Agenda /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><DashboardLayout><Admin /></DashboardLayout></ProtectedRoute>} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<ProtectedRoute><DashboardLayout><NotFound /></DashboardLayout></ProtectedRoute>} />
          </Routes>
          </WorkspaceTabsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
