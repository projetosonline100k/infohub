// Saúde do Mac (12/11/2026, Davi: "a orbe fica amarela/vermelha quando o PC estiver para sobrecarregar e, no hover, avisa: pouca memória etc.").
// A decisão em cima dos números que o Rust lê (src-tauri/src/saude.rs): qual nível (ok / atenção / crítico), o que dizer e o que fazer. Sem
// React nem importações: testável.

export interface ConsumoApp { nome: string; valor: number }
export interface SaudePc {
  cpu_pct: number | null; mem_livre_pct: number | null; mem_total_gb: number | null;
  swap_usado_gb: number | null; swap_total_gb: number | null; disco_livre_gb: number | null; disco_livre_pct: number | null;
  bateria_pct: number | null; carregando: boolean; limite_termico: number | null;
  top_memoria: ConsumoApp[]; top_cpu: ConsumoApp[];
}
export type Nivel = "ok" | "atencao" | "critico";
export interface Aviso { tipo: "memoria" | "swap" | "cpu" | "disco" | "bateria" | "termico"; nivel: Exclude<Nivel, "ok">; titulo: string; dica: string }
export interface Avaliacao { nivel: Nivel; avisos: Aviso[] }

const ordem: Record<Nivel, number> = { ok: 0, atencao: 1, critico: 2 };
export const maisGrave = (a: Nivel, b: Nivel): Nivel => (ordem[a] >= ordem[b] ? a : b);
const gb = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1).replace(".", ",")} GB`;
const lista = (v: ConsumoApp[], f: (n: number) => string) => v.filter((x) => x.valor > 0).slice(0, 2).map((x) => `${x.nome} (${f(x.valor)})`).join(" e ");

export function avaliarSaude(s: SaudePc): Avaliacao {
  const avisos: Aviso[] = [];
  const pesados = lista(s.top_memoria, gb);

  if (s.mem_livre_pct != null && s.mem_livre_pct <= 18) {
    const critico = s.mem_livre_pct <= 8;
    avisos.push({ tipo: "memoria", nivel: critico ? "critico" : "atencao", titulo: `Pouca memória livre (${Math.round(s.mem_livre_pct)}% livre)`,
      dica: pesados ? `Feche o que não está usando. O que mais pesa: ${pesados}.` : "Feche abas e aplicativos que não está usando." });
  }
  if (s.swap_usado_gb != null && s.mem_total_gb) {
    const proporcao = s.swap_usado_gb / s.mem_total_gb;
    if (proporcao >= 0.5) {
      avisos.push({ tipo: "swap", nivel: proporcao >= 1 ? "critico" : "atencao", titulo: `O Mac está usando ${gb(s.swap_usado_gb)} do disco como memória`,
        dica: "Isso deixa tudo lento. Feche aplicativos pesados ou reinicie o Mac para limpar." });
    }
  }
  if (s.cpu_pct != null && s.cpu_pct >= 75) {
    const quem = lista(s.top_cpu, (n) => `${Math.round(n)}%`);
    avisos.push({ tipo: "cpu", nivel: s.cpu_pct >= 90 ? "critico" : "atencao", titulo: `Processador a ${Math.round(s.cpu_pct)}%`,
      dica: quem ? `Quem mais usa: ${quem}.` : "Algum programa está trabalhando muito agora." });
  }
  if (s.disco_livre_gb != null && s.disco_livre_pct != null && (s.disco_livre_pct <= 10 || s.disco_livre_gb <= 20)) {
    const critico = s.disco_livre_pct <= 5 || s.disco_livre_gb <= 10;
    avisos.push({ tipo: "disco", nivel: critico ? "critico" : "atencao", titulo: `Disco quase cheio: só ${gb(s.disco_livre_gb)} livres`,
      dica: "Com o disco cheio o Mac trava e não consegue nem usar memória extra. Apague downloads e vídeos grandes." });
  }
  if (s.bateria_pct != null && !s.carregando && s.bateria_pct <= 20) {
    avisos.push({ tipo: "bateria", nivel: s.bateria_pct <= 10 ? "critico" : "atencao", titulo: `Bateria em ${Math.round(s.bateria_pct)}%`, dica: "Conecte o carregador." });
  }
  if (s.limite_termico != null && s.limite_termico < 100) {
    avisos.push({ tipo: "termico", nivel: s.limite_termico <= 60 ? "critico" : "atencao", titulo: "O Mac está esquentando e diminuindo a velocidade", dica: "Deixe-o ventilar e feche o que estiver pesado." });
  }
  const nivel = avisos.reduce<Nivel>((n, a) => maisGrave(n, a.nivel), "ok");
  return { nivel, avisos: avisos.sort((a, b) => ordem[b.nivel] - ordem[a.nivel]) };
}

/**
 * Para a cor não piscar: subir de nível exige duas leituras seguidas iguais ou piores; descer é imediato quando melhora duas vezes.
 * `anterior` é o nível que está sendo mostrado; `lido` é o que acabou de ser medido; `pendente` guarda a leitura anterior que ainda não valeu.
 */
export function suavizarNivel(anterior: Nivel, lido: Nivel, pendente: Nivel | null): { mostrar: Nivel; pendente: Nivel | null } {
  if (lido === anterior) return { mostrar: anterior, pendente: null };
  if (pendente === lido) return { mostrar: lido, pendente: null };   // duas leituras seguidas no mesmo lado: vale
  return { mostrar: anterior, pendente: lido };
}
