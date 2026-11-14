// Roteiros dos vídeos dark em calendário (13/11/2026, Davi, com um desenho: "eu subo o roteiro, o Lauro faz o resto; calendário com o status embaixo de cada roteiro").
// Sem React nem importações: testável.

export type StatusRoteiro = "na_fila" | "editando" | "revisar" | "programando" | "programado" | "publicando" | "publicado" | "erro";
export interface VersaoRoteiro { arquivo: string; em?: string; nota?: string }
export interface RoteiroDark { id: string; perfil_id: string; numero: number; titulo: string; texto: string; data_postagem: string | null; status: StatusRoteiro; arquivo: string | null; obs: string | null; versoes?: VersaoRoteiro[] | null; legenda?: string | null; video_url?: string | null; programado_para?: string | null; permalink?: string | null; mensagem?: string | null; ig_media_id?: string | null; criado_em: string }

export const ROTULO_STATUS: Record<StatusRoteiro, string> = { na_fila: "Na fila", editando: "Editando", revisar: "Aprovar", programando: "Programando", programado: "Programado", publicando: "Publicando", publicado: "Publicado", erro: "Travou" };

/** Soma dias a uma data AAAA-MM-DD (sem fuso: tudo em UTC ao meio-dia). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dia sugerido para o próximo roteiro: o dia seguinte ao último já marcado (ou amanhã, se não há nenhum futuro). */
export function proximoDiaLivre(roteiros: Pick<RoteiroDark, "data_postagem">[], hoje: string): string {
  const futuros = roteiros.map((r) => r.data_postagem).filter((d): d is string => !!d && d >= hoje).sort();
  return somarDias(futuros.length ? futuros[futuros.length - 1] : hoje, 1);
}

export interface DiaCalendario { dia: string; numero: number; doMes: boolean }
/** Grade do mês em semanas (segunda a domingo), com os dias dos meses vizinhos que completam as pontas. `mes` é 1 a 12. */
export function semanasDoMes(ano: number, mes: number): DiaCalendario[][] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1, 12));
  const deslocamento = (primeiro.getUTCDay() + 6) % 7;   // segunda = 0
  const inicio = somarDias(primeiro.toISOString().slice(0, 10), -deslocamento);
  const ultimo = new Date(Date.UTC(ano, mes, 0, 12)).getUTCDate();
  const semanas = Math.ceil((deslocamento + ultimo) / 7);
  const grade: DiaCalendario[][] = [];
  for (let s = 0; s < semanas; s++) {
    grade.push(Array.from({ length: 7 }, (_, i) => {
      const dia = somarDias(inicio, s * 7 + i);
      return { dia, numero: Number(dia.slice(8)), doMes: dia.startsWith(`${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`) };
    }));
  }
  return grade;
}

export function agruparPorDia(roteiros: RoteiroDark[]): Map<string, RoteiroDark[]> {
  const m = new Map<string, RoteiroDark[]>();
  for (const r of [...roteiros].sort((a, b) => a.numero - b.numero)) if (r.data_postagem) m.set(r.data_postagem, [...(m.get(r.data_postagem) ?? []), r]);
  return m;
}

export const contarPorStatus = (roteiros: Pick<RoteiroDark, "status">[]): Record<StatusRoteiro, number> => {
  const c: Record<StatusRoteiro, number> = { na_fila: 0, editando: 0, revisar: 0, programando: 0, programado: 0, publicando: 0, publicado: 0, erro: 0 };
  for (const r of roteiros) c[r.status]++;
  return c;
};

/** Versões do vídeo (v1, v2…), da mais antiga para a mais nova. Sem histórico, vale o arquivo atual. */
export function versoesDoRoteiro(r: Pick<RoteiroDark, "arquivo" | "versoes">): VersaoRoteiro[] {
  const lista = (Array.isArray(r.versoes) ? r.versoes : []).filter((v) => v && typeof v.arquivo === "string" && v.arquivo);
  if (lista.length) return lista;
  return r.arquivo ? [{ arquivo: r.arquivo }] : [];
}

const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

/** O pedido que acorda o Lauro quando o Davi sobe um roteiro (ele lê o roteiro e o estilo pelo script e atualiza o status). */
export function mensagemParaLauro(r: Pick<RoteiroDark, "id" | "numero" | "titulo" | "data_postagem">, perfil: string): string {
  const id = r.id.slice(0, 8);
  return `NOVO ROTEIRO V${r.numero} do perfil ${perfil}: "${r.titulo}"${r.data_postagem ? `, para postar em ${dataBr(r.data_postagem)}` : ""}.\n\n` +
    `Faça o resto sozinho:\n1. Leia o roteiro e o estilo do vídeo do perfil: python3 scripts/lauro/roteiros.py contexto ${id}\n` +
    `2. Avise que começou: python3 scripts/lauro/roteiros.py status ${id} editando\n` +
    `3. VOZ: gere a narração no ElevenLabs, pelo Chrome (já estou logado lá): abra https://elevenlabs.io/app/speech-synthesis/text-to-speech, escolha a voz "Gregory Grumble - Old Lovable Bedtime Bear" (a menos que o estilo do perfil peça outra), cole o roteiro inteiro e gere UMA vez só (cada geração gasta créditos: confira o saldo antes, avise se não der e nunca compre nem assine nada). Baixe o mp3 para ~/.infopro-hub/exemplos/<perfil>/roteiros/${id}/voz.mp3 e aplique o ajuste de velocidade do estilo (ex.: 1.1x) com o ffmpeg.\n` +
    `4. VÍDEO: com essa voz, produza o vídeo no estilo cadastrado (imagens, legendas sincronizadas com a fala, música, cortes) e salve em ~/.infopro-hub/exemplos/<perfil>/roteiros/${id}/video_v1.mp4 (cite o caminho completo aqui no chat).\n` +
    `5. Quando o vídeo estiver pronto, NÃO programe: marque python3 scripts/lauro/roteiros.py status ${id} revisar --arquivo <caminho> --obs "o que você fez" . Isso faz aparecer no meu estúdio o vídeo e o botão Aprovar. Se eu pedir mudanças, gere uma NOVA versão (video_v2.mp4, v3…) e marque revisar de novo.\n` +
    `6. Depois do meu Aprovar você não precisa fazer mais nada: o Hub comprime o vídeo aprovado, eu escolho a data e a legenda no estúdio e a nuvem publica no Instagram do perfil. NÃO agende nem poste pelo Chrome.
` +
    `Se travar em algo: status ${id} erro --obs "o que aconteceu". Nada é publicado sem o meu Aprovar.`;
}

/** Pedido de mudança feito no estúdio do roteiro (chat com o Lauro). */
export function mensagemAjuste(r: Pick<RoteiroDark, "id" | "numero" | "titulo">, texto: string): string {
  const id = r.id.slice(0, 8);
  return `AJUSTE no roteiro V${r.numero} ("${r.titulo}", id ${id}): ${texto}\n\n` +
    `Se a mudança altera o vídeo: marque python3 scripts/lauro/roteiros.py status ${id} editando, gere uma NOVA versão (nunca sobrescreva a anterior: video_v2.mp4, v3…), cite o caminho completo aqui e marque status ${id} revisar --arquivo <caminho> --obs "o que mudou" para eu aprovar. Se for só dúvida, responda sem mexer no status.`;
}

