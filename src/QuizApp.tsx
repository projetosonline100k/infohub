import { BrowserRouter, Route, Routes } from "react-router-dom";
import QuizPublico from "./pages/QuizPublico";

/** Só o quiz público (21/11): quem abre /quiz/... não baixa o app inteiro (login, painel, editores) — só o que o quiz usa. */
export default function QuizApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/quiz/:slug" element={<QuizPublico />} />
        <Route path="/quiz-previa/:token" element={<QuizPublico previa />} />
      </Routes>
    </BrowserRouter>
  );
}
