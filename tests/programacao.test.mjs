import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/programacao.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { sugerirData, instante, problemaNoHorario, horaDoReel } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('sugere hoje antes das 10h, amanhã depois, e pula dias com post', () => {
  assert.equal(sugerirData(new Date(2026, 9, 14, 8, 0), []), '2026-10-14');
  assert.equal(sugerirData(new Date(2026, 9, 14, 9, 55), []), '2026-10-15'); // menos de 10 min de folga
  assert.equal(sugerirData(new Date(2026, 9, 14, 13, 40), []), '2026-10-15');
  assert.equal(sugerirData(new Date(2026, 9, 14, 13, 40), ['2026-10-15', '2026-10-16']), '2026-10-17');
  assert.equal(sugerirData(new Date(2026, 9, 31, 13, 0), []), '2026-11-01'); // virada de mês
});

test('instante e validação do horário', () => {
  const agora = new Date(2026, 9, 14, 13, 40);
  assert.equal(instante('2026-10-16', '10:00').getTime(), new Date(2026, 9, 16, 10, 0).getTime());
  assert.equal(instante('16/10', '10:00'), null);
  assert.equal(problemaNoHorario(null, agora), 'Escolha o dia e a hora.');
  assert.match(problemaNoHorario(new Date(2026, 9, 14, 13, 42), agora), /5 minutos/);
  assert.equal(problemaNoHorario(new Date(2026, 9, 16, 10, 0), agora), null);
});

test('reel: 18h no primeiro dia sem reel (carrossel não ocupa), 12h se o dia já tem reel', () => {
  // 16/10 às 13h: o reel ainda cabe hoje às 18h, mesmo com carrossel hoje.
  assert.equal(sugerirData(new Date(2026, 9, 16, 13, 0), [], '18:00'), '2026-10-16');
  assert.equal(sugerirData(new Date(2026, 9, 16, 17, 55), [], '18:00'), '2026-10-17');
  assert.equal(sugerirData(new Date(2026, 9, 16, 13, 0), ['2026-10-16'], '18:00'), '2026-10-17');
  assert.equal(horaDoReel('2026-10-17', []), '18:00');
  assert.equal(horaDoReel('2026-10-16', ['2026-10-16']), '12:00');
});
