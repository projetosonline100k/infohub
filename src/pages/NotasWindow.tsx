import { useAuth } from "@/auth/AuthProvider";
import Notas from "./Notas";

// Janela própria de Notas no Mac (20/10, Davi: "igual o Notas, abrir uma parte separada sempre
// que abrir o Infopro"). Aberta pelo comando abrir_notas (src-tauri/src/janelas.rs). A faixa de
// cima arrasta a janela (os botões vermelho/amarelo/verde ficam nela).
export default function NotasWindow() {
  const { session, loading } = useAuth();
  if (loading) return <div className="h-screen bg-card" />;
  if (!session) return <div className="flex h-screen items-center justify-center bg-card text-sm text-muted-foreground">Entre no Infopro para ver suas notas.</div>;
  return (
    <div className="relative h-screen">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-9" />
      <Notas janela />
    </div>
  );
}
