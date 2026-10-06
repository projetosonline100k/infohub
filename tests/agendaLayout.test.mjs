import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/agendaLayout.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { distribuirSobrepostos } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const h = (hora) => hora * 60;
const horizontal = (p) => ({ left: p.left, width: p.width });

test('evento sozinho ocupa a largura toda', () => {
  const r = distribuirSobrepostos([{ key: 'a', inicio: h(9), fim: h(10) }]);
  assert.deepEqual(horizontal(r.get('a')), { left: 0, width: 100 });
});

test('eventos que começam juntos ficam lado a lado', () => {
  const r = distribuirSobrepostos([{ key: 'a', inicio: h(9), fim: h(10) }, { key: 'b', inicio: h(9.25), fim: h(10) }]);
  assert.deepEqual([horizontal(r.get('a')), horizontal(r.get('b'))], [{ left: 0, width: 50 }, { left: 50, width: 50 }]);
});

test('evento que começa quando outro termina não divide espaço', () => {
  const r = distribuirSobrepostos([{ key: 'a', inicio: h(9), fim: h(10) }, { key: 'b', inicio: h(10), fim: h(11) }]);
  assert.deepEqual([horizontal(r.get('a')), horizontal(r.get('b'))], [{ left: 0, width: 100 }, { left: 0, width: 100 }]);
});

test('evento que começa bem depois fica por cima, recuado', () => {
  const r = distribuirSobrepostos([{ key: 'longo', inicio: h(13), fim: h(17) }, { key: 'reuniao', inicio: h(14), fim: h(15) }]);
  assert.deepEqual(horizontal(r.get('longo')), { left: 0, width: 100 });
  assert.deepEqual(horizontal(r.get('reuniao')), { left: 12, width: 88 });
  assert.ok(r.get('reuniao').z > r.get('longo').z);
});

test('recuo tem limite para o evento não sumir', () => {
  const eventos = Array.from({ length: 10 }, (_, i) => ({ key: `e${i}`, inicio: h(8) + i * 40, fim: h(20) }));
  const r = distribuirSobrepostos(eventos);
  assert.ok(r.get('e9').width >= 30);
});

test('grupos separados não influenciam um ao outro', () => {
  const r = distribuirSobrepostos([
    { key: 'a', inicio: h(9), fim: h(10) }, { key: 'b', inicio: h(9), fim: h(10) }, { key: 'c', inicio: h(9), fim: h(10) },
    { key: 'd', inicio: h(14), fim: h(15) },
  ]);
  assert.equal(Math.round(r.get('c').width), 33);
  assert.deepEqual(horizontal(r.get('d')), { left: 0, width: 100 });
});
