import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import FormularioPublico from "./pages/FormularioPublico";
import QuizPublico from "./pages/QuizPublico";
import ChatbotPublico from "./pages/ChatbotPublico";
import Login from "./pages/Login";
import RedefinirSenha from "./pages/RedefinirSenha";
import JarvisWindow from "./pages/JarvisWindow";
import Privacidade from "./pages/Privacidade";
import InstagramConectado from "./pages/InstagramConectado";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { WorkspaceTabsProvider } from "@/components/workspace/WorkspaceTabs";
import { DialogosGlobais } from "@/components/DialogosGlobais";

// Páginas pesadas só baixam quando a rota é aberta (15/11/2026, Davi: "demora muito no começo para abrir o quiz"):
// o quiz público carregava o app inteiro, com a lousa (Excalidraw, 1,5 MB) e o editor de documentos.
const DashboardLayout = lazy(() => import("./components/DashboardLayout").then((m) => ({ default: m.DashboardLayout })));
const FocoLateral = lazy(() => import("./pages/FocoLateral"));
const NotasWindow = lazy(() => import("./pages/NotasWindow"));
const AgendaWindow = lazy(() => import("./pages/AgendaWindow"));
const DocumentoCompartilhado = lazy(() => import("./pages/DocumentoCompartilhado"));
const Carregando = () => <div className="min-h-screen bg-background" />;

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
          <Suspense fallback={<Carregando />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          {/* Public route without layout */}
          <Route path="/formulario/:slug" element={<FormularioPublico />} />
          <Route path="/quiz/:slug" element={<QuizPublico />} />
          <Route path="/quiz-previa/:token" element={<QuizPublico previa />} />
          <Route path="/chatbot/:slug" element={<ChatbotPublico />} />
          <Route path="/compartilhado/:token" element={<DocumentoCompartilhado />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/instagram/conectado" element={<InstagramConectado />} />

          {/* Janela nativa `jarvis` (desktop, ver src-tauri/tauri.conf.json) —
              sem DashboardLayout e sem ProtectedRoute (essa nunca redireciona
              pra /login: ver JarvisWindow.tsx). */}
          <Route path="/jarvis" element={<JarvisWindow />} />
          <Route path="/foco-lateral" element={<FocoLateral />} />
          <Route path="/notas-janela" element={<NotasWindow />} />
          <Route path="/agenda-janela" element={<AgendaWindow />} />
          
          {/* Rotas protegidas: o layout renderiza as páginas por aba
              (ver src/components/workspace/WorkspacePages.tsx). */}
          <Route path="*" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} />
          </Routes>
          </Suspense>
          </WorkspaceTabsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
