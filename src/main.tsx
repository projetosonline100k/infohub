import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ligarDesfazerDoMenu } from "./lib/desktop/desfazer";
import { restaurarRotaInicial } from "./lib/workspace/sessao";

void ligarDesfazerDoMenu();

// Reabre na guia em que o Davi estava (só a janela principal do app do Mac).
restaurarRotaInicial();

createRoot(document.getElementById("root")!).render(<App />);
