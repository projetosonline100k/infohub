import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('src/lib/mapaMentalRecolhivel.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('converter: a seleção vira título e o resto fica dentro', () => {
  const t = 'Roteiro: O Lula tem 18 milhões.';
  const r = m.converter(t, 0, 8);
  assert.equal(r.texto, '▾ Roteiro: O Lula tem 18 milhões.'.replace('Roteiro: O', 'Roteiro: O'));
  assert.deepEqual(r.dados, { aberto: true, titulo: 'Roteiro:' });
  assert.equal(m.converter('só isso', 0, 7), null);          // nada depois: não há o que esconder
  assert.equal(m.converter('abc', 2, 2), null);              // sem seleção
});
test('alternar: fecha escondendo o corpo e abre devolvendo igual', () => {
  const inicio = 'Antes ' + '▾ Roteiro:' + ' O Lula tem 18 milhões.\nSegunda linha.';
  const fechado = m.alternar(inicio, { aberto: true, titulo: 'Roteiro:' });
  assert.equal(fechado.texto, 'Antes ▸ Roteiro: …');
  assert.equal(fechado.dados.aberto, false);
  const aberto = m.alternar(fechado.texto, fechado.dados);
  assert.equal(aberto.texto, inicio);
  assert.equal(m.alternar('texto sem marca', { aberto: true, titulo: 'x' }), null);
});
test('alternar: título editado enquanto fechado vale na reabertura', () => {
  const f = m.alternar('▾ A corpo', { aberto: true, titulo: 'A' });
  const editado = f.texto.replace('A …', 'Novo título …');
  assert.equal(m.alternar(editado, f.dados).texto, '▾ Novo título corpo');
});
test('quebrar respeita a largura', () => {
  const medir = (s) => s.length * 10;
  assert.equal(m.quebrar('aa bb cc dd', 50, medir), 'aa bb\ncc dd');
  assert.equal(m.quebrar('um\ndois três', 1000, medir), 'um\ndois três');
});
