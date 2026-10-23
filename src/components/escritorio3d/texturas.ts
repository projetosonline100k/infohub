import * as THREE from "three";

// Texturas desenhadas num <canvas> (sem baixar imagens nem fontes): placas, telas, piso, rostos.
// Ficam em cache pela chave, então cada uma é criada uma vez só.
const cache = new Map<string, THREE.CanvasTexture>();

export function texturaCanvas(chave: string, w: number, h: number, desenhar: (c: CanvasRenderingContext2D) => void, pixelado = false) {
  const pronta = cache.get(chave);
  if (pronta) return pronta;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d")!;
  desenhar(c);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (pixelado) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  cache.set(chave, t);
  return t;
}

const FONTE = "-apple-system, 'Inter', 'Segoe UI', Roboto, sans-serif";

/** Placa de setor/direção: fundo escuro, texto claro, um acento colorido. */
export function texturaPlaca(texto: string, cor = "#38bdf8", largura = 1024, altura = 256) {
  return texturaCanvas(`placa:${texto}:${cor}:${largura}x${altura}`, largura, altura, (c) => {
    c.fillStyle = "#0f0d0b"; c.fillRect(0, 0, largura, altura);
    c.strokeStyle = cor; c.lineWidth = 10; c.strokeRect(12, 12, largura - 24, altura - 24);
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    // Cabe na largura (texto comprido ganha letra menor).
    let tam = Math.round(altura * 0.42);
    c.font = `800 ${tam}px ${FONTE}`;
    while (tam > 12 && c.measureText(texto).width > largura - 80) { tam -= 2; c.font = `800 ${tam}px ${FONTE}`; }
    c.shadowColor = cor; c.shadowBlur = 24;
    c.fillText(texto, largura / 2, altura / 2 + 4);
  });
}

/** Etiqueta com nome (em cima dos personagens), com a bolinha do status. */
export function texturaEtiqueta(nome: string, corStatus: string) {
  return texturaCanvas(`etiqueta:${nome}:${corStatus}`, 512, 128, (c) => {
    c.font = `700 54px ${FONTE}`;
    const w = Math.min(500, c.measureText(nome).width + 110);
    const x = (512 - w) / 2;
    c.fillStyle = "rgba(15,13,11,.82)";
    c.beginPath(); c.roundRect(x, 24, w, 80, 40); c.fill();
    c.fillStyle = corStatus; c.beginPath(); c.arc(x + 44, 64, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(nome, x + 72, 66);
  });
}

/** Ícone de atenção ("!") sobre quem precisa de você ou está com problema. */
export function texturaAlerta(cor: string) {
  return texturaCanvas(`alerta:${cor}`, 128, 128, (c) => {
    c.fillStyle = cor; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 8; c.stroke();
    c.fillStyle = "#fff"; c.font = `900 84px ${FONTE}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("!", 64, 70);
  });
}

/** Piso de tábuas de madeira. */
export function texturaPiso() {
  const t = texturaCanvas("piso", 512, 512, (c) => {
    const tons = ["#7a5a3e", "#71533a", "#836143", "#77583d", "#6c4f36"];
    for (let i = 0; i < 8; i++) {
      // Tábuas de 256 px, uma fileira deslocada da outra (sem deixar buraco).
      const desloca = i % 2 ? -128 : 0;
      for (let j = 0; j < 3; j++) {
        c.fillStyle = tons[(i * 3 + j) % tons.length];
        c.fillRect(desloca + j * 256, i * 64, 256, 64);
        c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(desloca + j * 256, i * 64, 3, 64);
      }
      c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(0, i * 64, 512, 3);
      c.fillStyle = "rgba(255,255,255,.04)"; c.fillRect(0, i * 64 + 8, 512, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tela de edição de vídeo: imagem do vídeo + linha do tempo com trilhas coloridas. */
export function texturaTelaEdicao(variante = 0) {
  return texturaCanvas(`tela-edicao:${variante}`, 512, 320, (c) => {
    c.fillStyle = "#0b1020"; c.fillRect(0, 0, 512, 320);
    const g = c.createLinearGradient(40, 20, 300, 180);
    g.addColorStop(0, ["#f59e0b", "#22d3ee", "#a78bfa"][variante % 3]); g.addColorStop(1, "#1e293b");
    c.fillStyle = g; c.fillRect(24, 20, 300, 170);
    c.fillStyle = "#e2e8f0"; c.fillRect(340, 20, 150, 12); c.fillRect(340, 44, 110, 10); c.fillRect(340, 64, 130, 10);
    const trilhas = ["#38bdf8", "#f472b6", "#34d399", "#fbbf24"];
    trilhas.forEach((cor, k) => {
      let x = 24;
      while (x < 488) { const w = 30 + ((x * 7 + k * 13 + variante * 17) % 70); c.fillStyle = cor; c.globalAlpha = 0.85; c.fillRect(x, 210 + k * 24, Math.min(w, 488 - x), 18); x += w + 6; }
    });
    c.globalAlpha = 1; c.fillStyle = "#ef4444"; c.fillRect(200 + variante * 40, 204, 3, 110);
  });
}

/** Tela de métricas (gráfico de linha + barras). */
export function texturaTelaMetricas(variante = 0) {
  return texturaCanvas(`tela-metricas:${variante}`, 512, 320, (c) => {
    c.fillStyle = "#08111f"; c.fillRect(0, 0, 512, 320);
    c.strokeStyle = "#34d399"; c.lineWidth = 6; c.beginPath();
    for (let i = 0; i <= 10; i++) { const y = 200 - Math.sin(i * 0.7 + variante) * 50 - i * 9; if (i) c.lineTo(30 + i * 45, y); else c.moveTo(30, y); }
    c.stroke();
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#38bdf8" : "#a78bfa"; const h = 30 + ((i * 37 + variante * 11) % 80); c.fillRect(40 + i * 56, 300 - h, 34, h); }
  });
}

/** Rosto voxel (frente da cabeça): olhos, boca e a franja do cabelo. */
export function texturaRosto(pele: string, cabelo: string, barba: boolean, oculos: boolean) {
  return texturaCanvas(`rosto:${pele}:${cabelo}:${barba}:${oculos}`, 8, 8, (c) => {
    c.fillStyle = pele; c.fillRect(0, 0, 8, 8);
    c.fillStyle = cabelo; c.fillRect(0, 0, 8, 2); c.fillRect(0, 2, 1, 1); c.fillRect(7, 2, 1, 1);
    c.fillStyle = "#fff"; c.fillRect(1, 3, 2, 1); c.fillRect(5, 3, 2, 1);
    c.fillStyle = "#2a1d15"; c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1);
    if (oculos) { c.fillStyle = "#111827"; c.fillRect(1, 3, 6, 1); c.fillStyle = "#cbd5e1"; c.fillRect(2, 3, 1, 1); c.fillRect(5, 3, 1, 1); }
    c.fillStyle = "#9a5a44"; c.fillRect(3, 6, 2, 1);
    if (barba) { c.fillStyle = cabelo; c.fillRect(1, 5, 1, 3); c.fillRect(6, 5, 1, 3); c.fillRect(2, 7, 4, 1); c.fillRect(2, 6, 1, 1); c.fillRect(5, 6, 1, 1); }
  }, true);
}

/** Tela do "Nosso resultado" (TV física no fim do corredor). */
export function texturaResultado(r: { concluidas: number; publicados: number; faltam: number; destaque: string; atrasadas: number } | null) {
  const chave = r ? `resultado:${r.concluidas}:${r.publicados}:${r.faltam}:${r.destaque}:${r.atrasadas}` : "resultado:vazio";
  return texturaCanvas(chave, 1024, 576, (c) => {
    c.fillStyle = "#0b1220"; c.fillRect(0, 0, 1024, 576);
    c.fillStyle = "#fbbf24"; c.font = `800 52px ${FONTE}`; c.fillText("🏆 Nosso resultado", 48, 92);
    const caixa = (x: number, y: number, valor: string, rotulo: string, cor = "#fff") => {
      c.fillStyle = "#16233a"; c.beginPath(); c.roundRect(x, y, 448, 190, 22); c.fill();
      c.fillStyle = cor; c.font = `800 92px ${FONTE}`; c.fillText(valor, x + 32, y + 108);
      c.fillStyle = "#94a3b8"; c.font = `600 32px ${FONTE}`; c.fillText(rotulo, x + 32, y + 160);
    };
    if (!r) { c.fillStyle = "#94a3b8"; c.font = `600 36px ${FONTE}`; c.fillText("Carregando os números da semana…", 48, 300); return; }
    caixa(48, 140, String(r.concluidas), "Tarefas entregues");
    caixa(528, 140, String(r.publicados), "Posts publicados");
    caixa(48, 352, String(r.faltam), r.atrasadas ? `Faltam · ${r.atrasadas} atrasadas` : "Faltam na semana", r.atrasadas ? "#fca5a5" : "#fff");
    caixa(528, 352, r.destaque || "—", "Destaque da semana", "#fde68a");
  });
}
