// Qual versão do código está no ar (18/11/2026): o botão Publicar do quiz compara este commit com o que o Mac enviou ao GitHub.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // O app (localhost:8080 / tauri://localhost) lê este endereço de outra origem; é só o hash público do commit.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  res.status(200).json({ commit: process.env.VERCEL_GIT_COMMIT_SHA || null });
}
