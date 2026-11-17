import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('src/lib/empresa/ads.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const m = (c, dia, gasto, resultados, valor = 0, imp = 1000, cli = 20) => ({ campanha_ref: c, dia, gasto, impressoes: imp, cliques: cli, resultados, valor_conversao: valor });

test('totais e métricas derivadas', () => {
  const t = a.totais([m('a', '2026-11-16', 100, 4, 400), m('a', '2026-11-17', 50, 1, 100)]);
  assert.equal(t.gasto, 150); assert.equal(t.resultados, 5);
  assert.equal(a.custoPorResultado(t), 30);
  assert.equal(a.retorno(t), 500 / 150);
  assert.equal(a.ctr(t), 2); assert.equal(a.cpm(t), 75);
  assert.equal(a.custoPorResultado(a.zero()), null); assert.equal(a.retorno(t) > 3, true);
  assert.equal(a.retorno({ ...t, valor: 0 }), null);
});
test('período, séries e campanhas', () => {
  assert.equal(a.desdeDia('2026-11-17', 1), '2026-11-17');
  assert.equal(a.desdeDia('2026-11-17', 7), '2026-11-11');
  const ms = [m('a', '2026-11-15', 10, 1), m('b', '2026-11-16', 30, 0), m('a', '2026-11-17', 20, 2)];
  assert.equal(a.filtrar(ms, '2026-11-16').length, 2);
  const s = a.serieDiaria(ms, '2026-11-15', '2026-11-17');
  assert.deepEqual(s.map((x) => x.gasto), [10, 30, 20]);
  assert.equal(a.serieDiaria(ms, '2026-11-14', '2026-11-15')[0].gasto, 0);   // dia sem dado = zero
  const por = a.porCampanha(ms);
  assert.equal(por.get('a').gasto, 30);
  assert.equal(a.semResultado(por.get('b')), true); assert.equal(a.semResultado(por.get('a')), false);
});
test('variação', () => { assert.equal(a.variacao(150, 100), 50); assert.equal(a.variacao(5, 0), null); });
