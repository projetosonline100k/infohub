import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import FormularioPublico from "./pages/FormularioPublico";
import Login from "./pages/Login";
import RedefinirSenha from "./pages/RedefinirSenha";
import DocumentoCompartilhado from "./pages/DocumentoCompartilhado";
import JarvisWindow from "./pages/JarvisWindow";
import Privacidade from "./pages/Privacidade";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { WorkspaceTabsProvider } from "@/components/workspace/WorkspaceTabs";
import { DialogosGlobais } from "@/components/DialogosGlobais";

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
      <DialogosGlobais />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceTabsProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          {/* Public route without layout */}
          <Route path="/formulario/:slug" element={<FormularioPublico />} />
          <Route path="/compartilhado/:token" element={<DocumentoCompartilhado />} />
          <Route path="/privacidade" element={<Privacidade />} />

          {/* Janela nativa `jarvis` (desktop, ver src-tauri/tauri.conf.json) —
              sem DashboardLayout e sem ProtectedRoute (essa nunca redireciona
              pra /login: ver JarvisWindow.tsx). */}
          <Route path="/jarvis" element={<JarvisWindow />} />
          
          {/* Rotas protegidas: o layout renderiza as páginas por aba
              (ver src/components/workspace/WorkspacePages.tsx). */}
          <Route path="*" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} />
          </Routes>
          </WorkspaceTabsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
