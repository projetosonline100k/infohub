import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Os sprites gratuitos do protótipo em pixel art (public/escritorio-pixel) têm licença não comercial:
    // servem só no `npm run dev` e nunca entram no build (web ou app).
    {
      name: "sem-sprites-do-prototipo",
      apply: "build" as const,
      closeBundle() {
        fs.rmSync(path.resolve(__dirname, "dist/escritorio-pixel"), { recursive: true, force: true });
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
