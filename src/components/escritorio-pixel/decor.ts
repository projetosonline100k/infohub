import { Container, Graphics, type Text } from "pixi.js";
import { TILE } from "./mapa";
import type { Decor } from "./cena";

// Desenhos em "pixel" (retângulos em pixels inteiros do mundo) para o que o pack gratuito não tem.
// Cada um é desenhado no canto (x, y) da cena e ocupa w × h tiles.

type Texto = (t: string, tamanho: number, cor?: number, peso?: "400" | "700" | "800") => Text;

const POSTITS = [0xfde047, 0xf9a8d4, 0x93c5fd, 0x86efac, 0xfdba74];
const TELAS = [
  [0x0b1020, 0xf59e0b, 0x38bdf8], // vídeo + linha do tempo
  [0x08111f, 0x34d399, 0xa78bfa], // gráfico
  [0x111827, 0xef4444, 0xfde047], // edição com corte
  [0x0f172a, 0x60a5fa, 0xf472b6], // planilha / feed
];

export function desenharDecor(dc: Decor, texto: Texto): Container {
  const c = new Container();
  c.position.set(Math.round(dc.x * TILE), Math.round(dc.y * TILE));
  const w = Math.round(dc.w * TILE), h = Math.round(dc.h * TILE);
  const g = new Graphics();
  c.addChild(g);
  const v = dc.v ?? 0;

  switch (dc.tipo) {
    case "quadro-ideias": {
      g.rect(0, 0, w, h).fill(0x7c4a24).rect(1, 1, w - 2, h - 2).fill(v ? 0xf3efe6 : 0xc89b63);
      let k = 0;
      for (let y = 3; y + 4 <= h - 2; y += 6) for (let x = 3; x + 4 <= w - 3; x += 6) {
        if ((x * 7 + y * 3) % 5 === 0) { g.rect(x, y + 1, 4, 1).fill(0x475569); continue; }
        g.rect(x, y, 4, 4).fill(POSTITS[k++ % POSTITS.length]);
      }
      g.moveTo(w * 0.55, 4).lineTo(w * 0.7, h - 5).stroke({ color: 0xdc2626, width: 0.6 });
      break;
    }
    case "quadro-viral": {
      g.rect(0, 0, w, h).fill(0x3f2a1d).rect(1, 1, w - 2, h - 2).fill(0x1f2937);
      // "vídeo" com o play vermelho
      g.roundRect(4, 3, 14, 10, 2).fill(0xef4444).poly([9, 5.5, 9, 10.5, 13.5, 8]).fill(0xffffff);
      // barras e linha subindo (análise)
      [5, 8, 6, 11, 13].forEach((b, i) => g.rect(24 + i * 4, h - 3 - b, 3, b).fill(i % 2 ? 0x38bdf8 : 0x34d399));
      g.moveTo(w - 32, h - 5).lineTo(w - 24, h - 9).lineTo(w - 16, h - 8).lineTo(w - 6, h - 14).stroke({ color: 0xfde047, width: 1 });
      for (let i = 0; i < 3; i++) g.rect(w - 30 + i * 8, 3, 6, 2).fill(POSTITS[i]);
      break;
    }
    case "quadro-vendas": {
      g.rect(0, 0, w, h).fill(0x7c4a24).rect(1, 1, w - 2, h - 2).fill(0xf8fafc);
      g.rect(5, 3, 1, h - 7).fill(0x334155).rect(5, h - 4, w - 10, 1).fill(0x334155);
      [3, 5, 7, 10].forEach((b, i) => g.rect(9 + i * 7, h - 4 - b, 4, b).fill(0x93c5fd));
      g.moveTo(7, h - 6).lineTo(18, h - 9).lineTo(28, h - 8).lineTo(w - 9, 4).stroke({ color: 0xf97316, width: 1.4 });
      g.poly([w - 9, 3, w - 5, 3.5, w - 8, 7]).fill(0xf97316);
      break;
    }
    case "quadro-parede": {
      const cores = [[0x0ea5e9, 0x22c55e], [0xf59e0b, 0xef4444], [0x111827, 0xf43f5e], [0x6366f1, 0xfde047]][v % 4];
      g.rect(0, 0, w, h).fill(0x5b3a1e).rect(1, 1, w - 2, h - 2).fill(cores[0]);
      g.rect(2, h - 5, w - 4, 3).fill(cores[1]).circle(w - 5, 4, 2).fill(0xfef3c7);
      break;
    }
    case "monitor": {
      const [fundo, a, b] = TELAS[v % TELAS.length];
      g.rect(w / 2 - 1, h - 2, 2, 2).fill(0x1f2937).rect(w / 2 - 3, h - 1, 6, 1).fill(0x1f2937);
      g.rect(0, 0, w, h - 2).fill(0x0b0f19).rect(1, 1, w - 2, h - 4).fill(fundo);
      g.rect(2, 2, Math.max(2, w * 0.45), Math.max(2, h * 0.35)).fill(a);
      for (let i = 0; i < 3; i++) g.rect(2 + i * 3, h - 5, 2, 1).fill(i % 2 ? a : b);
      break;
    }
    case "monitor-costas":
      g.rect(0, 0, w, h - 3).fill(0x1f2937).rect(1, 1, w - 2, h - 5).fill(0x374151);
      g.rect(w / 2 - 1, h - 3, 2, 3).fill(0x111827);
      break;
    case "notebook": {
      const [, a] = TELAS[(v + 1) % TELAS.length];
      g.rect(0, h * 0.45, w, h * 0.55).fill(0x9ca3af).rect(1, 0, w - 2, h * 0.5).fill(0x1f2937).rect(2, 1, w - 4, h * 0.5 - 2).fill(a);
      break;
    }
    case "papeis":
      g.rect(0, 1, w * 0.6, h - 1).fill(0xf8fafc).rect(w * 0.35, 0, w * 0.6, h - 1).fill(0xe2e8f0);
      g.rect(w * 0.4, 2, w * 0.4, 0.6).fill(0x94a3b8).rect(w * 0.4, 4, w * 0.3, 0.6).fill(0x94a3b8);
      break;
    case "cafe":
      g.rect(0, 1, w, h - 1).fill(0xf8fafc).rect(0.8, 1, w - 1.6, 1.2).fill(0x7c2d12).rect(w, 2, 1, 2).fill(0xf8fafc);
      break;
    case "plantinha":
      g.rect(w * 0.25, h * 0.55, w * 0.5, h * 0.45).fill(0xb45309);
      g.circle(w * 0.5, h * 0.4, w * 0.35).fill(0x16a34a).circle(w * 0.3, h * 0.3, w * 0.22).fill(0x22c55e).circle(w * 0.7, h * 0.3, w * 0.22).fill(0x15803d);
      break;
    case "tripe":
      g.moveTo(w / 2, h * 0.35).lineTo(2, h).moveTo(w / 2, h * 0.35).lineTo(w - 2, h).moveTo(w / 2, h * 0.35).lineTo(w / 2, h)
        .stroke({ color: 0x374151, width: 1 });
      g.rect(w / 2 - 5, h * 0.12, 10, 6).fill(0x111827).rect(w / 2 + 4, h * 0.12 + 1.5, 3, 3).fill(0x334155).circle(w / 2 - 2, h * 0.12 + 3, 1).fill(0xef4444);
      break;
    case "green-screen":
      g.rect(0, 0, w, 2).fill(0x6b7280).rect(1, 2, 1, h - 2).fill(0x6b7280).rect(w - 2, 2, 1, h - 2).fill(0x6b7280);
      g.rect(2, 2, w - 4, h - 4).fill(0x16a34a).rect(2, 2, w - 4, 3).fill(0x15803d);
      for (let y = 8; y < h - 4; y += 7) g.rect(3, y, w - 6, 0.5).fill({ color: 0x14532d, alpha: 0.5 });
      break;
    case "bebedouro":
      g.rect(1, h * 0.4, w - 2, h * 0.6).fill(0xe5e7eb).rect(2, h * 0.55, w - 4, 2).fill(0x9ca3af);
      g.roundRect(2, 0, w - 4, h * 0.42, 2).fill(0x60a5fa).rect(3, 1, 2, h * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    case "atlas":
      g.rect(w / 2 - 0.5, 0, 1, 3).fill(0x94a3b8).circle(w / 2, 0.5, 1.2).fill(0x38bdf8);
      g.roundRect(1, 3, w - 2, h * 0.42, 3).fill(0xf1f5f9).roundRect(2.5, 5, w - 5, h * 0.22, 2).fill(0x0f172a);
      g.rect(w / 2 - 3.5, 6.5, 2, 2).fill(0x22d3ee).rect(w / 2 + 1.5, 6.5, 2, 2).fill(0x22d3ee);
      g.roundRect(3, h * 0.5, w - 6, h * 0.38, 2).fill(0xe2e8f0).rect(w / 2 - 1.5, h * 0.58, 3, 2).fill(0x38bdf8);
      g.rect(4, h - 3, 3, 3).fill(0x94a3b8).rect(w - 7, h - 3, 3, 3).fill(0x94a3b8);
      break;
    case "cadeira-exec":
      g.roundRect(0, 0, w, h * 0.8, 3).fill(0x3b2416).roundRect(1.5, 1.5, w - 3, h * 0.8 - 4, 2).fill(0x5b3a24);
      g.rect(w / 2 - 1, h * 0.8, 2, h * 0.2).fill(0x1f2937);
      break;
    case "cafeteira":
      g.rect(0, 0, w, h).fill(0x1f2937).rect(2, 2, w - 4, 3).fill(0x374151).circle(w - 3, h - 3, 1).fill(0xef4444);
      g.rect(3, h - 5, 4, 3).fill(0xf8fafc);
      break;
    case "pia":
      g.rect(0, 0, w, h).fill(0xcbd5e1).rect(2, 1, w - 4, h - 2).fill(0x94a3b8).rect(w / 2 - 0.5, -3, 1, 4).fill(0x64748b);
      break;
    case "utensilios":
      [0xf59e0b, 0xef4444, 0x22c55e, 0x38bdf8].forEach((cor, i) => g.rect(1 + i * 3.5, h - 6 + (i % 2), 3, 5 - (i % 2)).fill(cor));
      break;
    case "tapete-entrada": {
      g.rect(0, 0, w, h).fill(0x991b1b).rect(1.5, 1.5, w - 3, h - 3).stroke({ color: 0xfbbf24, width: 1 });
      const seta = texto("▲", 7, 0xfde68a, "800"); seta.anchor.set(0.5); seta.position.set(w / 2, h * 0.38);
      const rotulo = texto("ENTRADA", 5.5, 0xffffff, "800"); rotulo.anchor.set(0.5); rotulo.position.set(w / 2, h * 0.62);
      c.addChild(seta, rotulo);
      break;
    }
    case "jardim":
      g.rect(0, 0, w, h).fill(0x2d4a26);
      for (let y = 2; y < h; y += 4) for (let x = (y % 8) ? 1 : 3; x < w; x += 5) g.rect(x, y, 1, 2).fill(0x4d7c3a);
      break;
    case "sebe":
      for (let x = 3; x < w; x += 5) g.circle(x, h / 2 + ((x / 5) % 2), h * 0.62).fill((x / 5) % 2 ? 0x2f6b2a : 0x3a7d32);
      break;
    case "beiral":
      g.rect(0, 0, w, h).fill(0x241a14);
      break;
  }
  return c;
}

/** Textura da luz quente das luminárias (gradiente redondo, somado por cima da cena). */
export function canvasDaLuz() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,196,120,0.55)");
  grad.addColorStop(0.45, "rgba(255,160,80,0.22)");
  grad.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}
