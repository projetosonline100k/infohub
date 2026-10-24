import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/ponte/painel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { duracaoTexto, duracaoMs, pedidosParados, concluidosPorDia, tempoMedioMs, contagemPorStatus, pedidoEmAndamento, proximoDaFila } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = new Date('2026-10-24T18:30:00').getTime();
const min = (n) => new Date(agora - n * 60000).toISOString();
const pedido = (o) => ({ id: 'x', titulo: 't', descricao: 'd', prioridade: 'normal', status: 'pendente', requer_aprovacao: true,
  aprovado: false, resultado: null, erro: null, iniciado_em: null, concluido_em: null, criado_em: min(1), origem: 'claude_voz', ...o });

test('duração em texto', () => {
  assert.equal(duracaoTexto(12_000), '12s');
  assert.equal(duracaoTexto(185_000), '3min 05s');
  assert.equal(duracaoTexto(3_720_000), '1h 02min');
});

test('cronômetro corre só em andamento; concluído usa início→fim', () => {
  assert.equal(duracaoMs(pedido({ status: 'em_andamento', iniciado_em: min(2) }), agora), 120_000);
  assert.equal(duracaoMs(pedido({ status: 'concluido', iniciado_em: min(10), concluido_em: min(7) }), agora), 180_000);
  assert.equal(duracaoMs(pedido({}), agora), null);
});

test('bolinha vermelha: aprovado/pronto e parado há mais de 5 min', () => {
  const parados = pedidosParados([
    pedido({ id: 'a', aprovado: true, criado_em: min(6) }),
    pedido({ id: 'b', aprovado: true, criado_em: min(3) }),
    pedido({ id: 'c', criado_em: min(30) }), // sem aprovação: não conta
    pedido({ id: 'd', requer_aprovacao: false, criado_em: min(6) }),
    pedido({ id: 'e', status: 'aguardando_aprovacao', aprovado: true, criado_em: min(9) }),
    pedido({ id: 'f', status: 'aguardando_aprovacao', criado_em: min(9) }),
  ], agora);
  assert.deepEqual(parados.map((p) => p.id), ['a', 'd', 'e']);
});

test('trabalhando agora e próximo da fila (mesma ordem do serviço)', () => {
  assert.equal(pedidoEmAndamento([pedido({})]), null);
  assert.equal(pedidoEmAndamento([pedido({ id: 'r', status: 'em_andamento', iniciado_em: min(2) })]).id, 'r');
  const ps = [
    pedido({ id: 'velho-normal', aprovado: true, criado_em: min(30) }),
    pedido({ id: 'novo-alto', prioridade: 'alta', requer_aprovacao: false, criado_em: min(1) }),
    pedido({ id: 'alto-sem-ok', prioridade: 'alta', status: 'aguardando_aprovacao', criado_em: min(60) }),
    pedido({ id: 'feito', prioridade: 'alta', status: 'concluido', aprovado: true, criado_em: min(90) }),
  ];
  assert.deepEqual(proximoDaFila(ps), { pedido: ps[1], pronto: true });
  assert.deepEqual(proximoDaFila(ps.slice(2)), { pedido: ps[2], pronto: false });
  assert.equal(proximoDaFila([ps[3]]), null);
});

test('concluídos por dia nos últimos 7 dias e tempo médio', () => {
  const ps = [
    pedido({ status: 'concluido', iniciado_em: min(10), concluido_em: min(8) }),
    pedido({ status: 'concluido', iniciado_em: min(5), concluido_em: min(1) }),
    pedido({ status: 'concluido', iniciado_em: '2026-10-01T10:00:00', concluido_em: '2026-10-01T10:01:00' }),
    pedido({ status: 'erro', iniciado_em: min(5), concluido_em: min(4) }),
  ];
  const serie = concluidosPorDia(ps, agora, 7);
  assert.equal(serie.length, 7);
  assert.equal(serie[6].dia, '2026-10-24');
  assert.equal(serie[6].total, 2);
  assert.equal(serie.reduce((a, d) => a + d.total, 0), 2);
  assert.equal(tempoMedioMs(ps), (120_000 + 240_000 + 60_000) / 3);
  assert.equal(contagemPorStatus(ps).concluido, 3);
});
