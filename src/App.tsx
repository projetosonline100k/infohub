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
import Admin from "./pages/Admin";
import FormularioPublico from "./pages/FormularioPublico";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./auth/AuthProvider";

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
          <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public route without layout */}
          <Route path="/formulario/:slug" element={<FormularioPublico />} />
          
          {/* Protected routes with layout */}
          <Route path="/" element={<ProtectedRoute><DashboardLayout><DashGeral /></DashboardLayout></ProtectedRoute>} />
          <Route path="/clientes" element={<ProtectedRoute><DashboardLayout><Clientes /></DashboardLayout></ProtectedRoute>} />
          <Route path="/clientes/:id" element={<ProtectedRoute><DashboardLayout><ClienteDetalhe /></DashboardLayout></ProtectedRoute>} />
          <Route path="/atividades" element={<ProtectedRoute><DashboardLayout><Atividades /></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><DashboardLayout><Admin /></DashboardLayout></ProtectedRoute>} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<ProtectedRoute><DashboardLayout><NotFound /></DashboardLayout></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
