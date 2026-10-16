import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/productivity/RascunhoRelatorio.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { montarRascunho, notaProdutividadeSugerida, notaFocoSugerida, deveLembrarDeEncerrar } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const dia = (extra = {}) => ({
  focoSegundos: 0,
  distracaoSegundos: 0,
  concluidasTitulos: [],
  prioridadeUm: null,
  pendentesDoPlano: [],
  ...extra,
});

test('dia vazio: nota 0, foco neutro, nada inventado', () => {
  const r = montarRascunho(dia());
  assert.equal(r.productivityScore, 0);
  assert.equal(r.focusScore, 3);
  assert.equal(r.mainWin, '');
  assert.equal(r.completedMainPriority, false);
  assert.equal(r.tomorrowMainPriority, '');
});

test('dia cheio com prioridade #1 concluída chega a 10 e vira a vitória', () => {
  const dados = dia({
    focoSegundos: 6 * 3600,
    concluidasTitulos: ['Oferta', 'Roteiro', 'Reunião', 'Copy'],
    prioridadeUm: { titulo: 'Oferta', concluida: true },
  });
  assert.equal(notaProdutividadeSugerida(dados), 10);
  const r = montarRascunho(dados);
  assert.equal(r.mainWin, 'Oferta');
  assert.equal(r.completedMainPriority, true);
});

test('prioridade #1 não concluída vira a prioridade de amanhã; pendentes do plano vão juntos', () => {
  const r = montarRascunho(
    dia({
      concluidasTitulos: ['Reunião'],
      prioridadeUm: { titulo: 'Gravar anúncios', concluida: false },
      pendentesDoPlano: ['Gravar anúncios', 'Revisar roteiro'],
    })
  );
  assert.equal(r.mainWin, 'Reunião');
  assert.equal(r.tomorrowMainPriority, 'Gravar anúncios');
  assert.equal(r.pendingForTomorrow, 'Gravar anúncios, Revisar roteiro');
});

test('nota de foco cai com a distração', () => {
  assert.equal(notaFocoSugerida(dia({ focoSegundos: 3600, distracaoSegundos: 60 })), 5);
  assert.equal(notaFocoSugerida(dia({ focoSegundos: 3600, distracaoSegundos: 3600 })), 1);
});

test('lembrete de encerrar só depois das 18h e sem relatório', () => {
  const as = (h) => new Date(2026, 9, 15, h, 0);
  assert.equal(deveLembrarDeEncerrar(as(17), false, false), false);
  assert.equal(deveLembrarDeEncerrar(as(18), false, false), true);
  assert.equal(deveLembrarDeEncerrar(as(19), true, false), false);
  assert.equal(deveLembrarDeEncerrar(as(19), null, false), false);
  assert.equal(deveLembrarDeEncerrar(as(19), false, true), false);
});
