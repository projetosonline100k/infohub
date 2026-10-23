import { useAuth } from "@/auth/AuthProvider";
import Agenda from "./Agenda";

// Janela própria da Agenda no Mac (23/10, Davi: "quero que a agenda seja aberta separadamente igual o
// notas"). Aberta pelo comando abrir_agenda (src-tauri/src/janelas.rs). A faixa de cima arrasta a janela
// (os botões vermelho/amarelo/verde ficam nela).
export default function AgendaWindow() {
  const { session, loading } = useAuth();
  if (loading) return <div className="h-screen bg-background" />;
  if (!session) return <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Entre no Infopro para ver sua agenda.</div>;
  return (
    <div className="relative h-screen overflow-auto bg-background">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-9" />
      <div className="px-5 pb-5 pt-11"><Agenda janela /></div>
    </div>
  );
}
