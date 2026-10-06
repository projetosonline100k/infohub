import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/relatorio/linhaDoTempo.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { montarLinhaDoTempo, resumoDoDia, duracaoCurta } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const h = (hhmm) => `2026-10-06T${hhmm}:00-03:00`;
const registros = [{ id: 'r1', texto: 'Fechei a call com o Matheus', registrado_em: h('10:30'), projeto: 'Core' }];
const concluidas = [{ id: 'a1', titulo: 'Gravar 3 vídeos', concluida_em: h('15:00'), projeto: 'Davi Queiroz' }];
const sessoes = [
  { id: 's1', started_at: h('09:00'), duration_seconds: 45 * 60, titulo: 'Roteiros', projeto: 'Core' },
  { id: 's2', started_at: h('11:00'), duration_seconds: 60, titulo: 'Abriu e fechou', projeto: null },
];

test('junta diário, concluídas e foco, do mais recente pro mais antigo', () => {
  const itens = montarLinhaDoTempo(registros, concluidas, sessoes);
  assert.deepEqual(itens.map((i) => `${i.tipo}:${i.id}`), ['concluida:a1', 'registro:r1', 'foco:s1']);
  assert.equal(itens[2].minutos, 45);
});

test('sessão de foco muito curta não entra na linha do tempo, mas conta no total', () => {
  assert.ok(!montarLinhaDoTempo(registros, concluidas, sessoes).some((i) => i.id === 's2'));
  assert.deepEqual(resumoDoDia(registros, concluidas, sessoes), { registros: 1, concluidas: 1, focoMinutos: 46 });
});

test('duração curta', () => {
  assert.equal(duracaoCurta(45), '45min');
  assert.equal(duracaoCurta(120), '2h');
  assert.equal(duracaoCurta(135), '2h 15min');
});
