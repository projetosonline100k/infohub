// Qual versão do código está no ar (18/11/2026): o botão Publicar do quiz compara este commit com o que o Mac enviou ao GitHub.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ commit: process.env.VERCEL_GIT_COMMIT_SHA || null });
}
