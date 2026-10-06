export interface IntervaloEvento {
  key: string;
  inicio: number;
  fim: number;
}

// left/width em % da coluna do dia; z cresce com o horário de início.
export interface PosicaoEvento {
  left: number;
  width: number;
  z: number;
}

// Eventos que começam com menos que isso de diferença ficam lado a lado.
const PROXIMIDADE_MINUTOS = 30;
// Evento que começa bem depois de outro ainda em andamento fica por cima
// dele, recuado — igual o Google Calendar.
const RECUO = 12;
const LEFT_MAXIMO = 70;

interface Grupo { left: number; membros: string[] }

export function distribuirSobrepostos(eventos: IntervaloEvento[]): Map<string, PosicaoEvento> {
  const ordenados = [...eventos].sort((a, b) => a.inicio - b.inicio || (b.fim - b.inicio) - (a.fim - a.inicio));
  const colocados: { key: string; inicio: number; fim: number; grupo: Grupo }[] = [];
  const grupos: Grupo[] = [];

  const leftProvisorio = (key: string, grupo: Grupo) =>
    grupo.left + grupo.membros.indexOf(key) * (100 - grupo.left) / grupo.membros.length;

  for (const evento of ordenados) {
    // Evento de duração zero ainda ocupa espaço visual.
    const fim = Math.max(evento.fim, evento.inicio + 1);
    const sobrepostos = colocados.filter((p) => p.fim > evento.inicio);
    const irmaos = sobrepostos
      .filter((p) => evento.inicio - p.inicio < PROXIMIDADE_MINUTOS)
      .sort((a, b) => b.grupo.left - a.grupo.left);

    let grupo: Grupo;
    if (irmaos.length > 0) {
      grupo = irmaos[0].grupo;
      grupo.membros.push(evento.key);
    } else {
      const base = sobrepostos.length > 0 ? Math.max(...sobrepostos.map((p) => leftProvisorio(p.key, p.grupo))) + RECUO : 0;
      grupo = { left: Math.min(LEFT_MAXIMO, base), membros: [evento.key] };
      grupos.push(grupo);
    }
    colocados.push({ key: evento.key, inicio: evento.inicio, fim, grupo });
  }

  const ordem = new Map(ordenados.map((evento, index) => [evento.key, index + 1]));
  const resultado = new Map<string, PosicaoEvento>();
  for (const grupo of grupos) {
    const width = (100 - grupo.left) / grupo.membros.length;
    grupo.membros.forEach((key, index) => resultado.set(key, { left: grupo.left + index * width, width, z: ordem.get(key) || 1 }));
  }
  return resultado;
}
