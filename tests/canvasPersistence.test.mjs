import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/canvasPersistence.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { mergeCanvas, parseCanvas, saveCanvasSafely, CANVAS_PREFIX } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const el = (id, version = 1, versionNonce = 1, extra = {}) => ({ id, version, versionNonce, ...extra });
const doc = (elements, files = {}) => CANVAS_PREFIX + JSON.stringify({ kind: 'canvas_mental', version: 1, elements, files, appState: {} });

test('duas pessoas salvando simultaneamente preservam os dois desenhos e imagens', async () => {
  let row = { conteudo: doc([]), updated_at: '0' };
  let conflicts = 0;
  const store = {
    read: async () => ({ ...row }),
    compareAndSwap: async (version, content) => {
      if (version !== row.updated_at) { conflicts++; return false; }
      row = { conteudo: content, updated_at: String(Number(version) + 1) };
      return true;
    },
  };
  await Promise.all([
    saveCanvasSafely(doc([el('a')], { imageA: { dataURL: 'a' } }), store),
    saveCanvasSafely(doc([el('b')], { imageB: { dataURL: 'b' } }), store),
  ]);
  assert.ok(conflicts > 0);
  assert.deepEqual(parseCanvas(row.conteudo).elements.map(e => e.id), ['a', 'b']);
  assert.deepEqual(Object.keys(parseCanvas(row.conteudo).files).sort(), ['imageA', 'imageB']);
});
test('aba atrasada não ressuscita desenho excluído', () => {
  const deleted = el('a', 3, 10, { isDeleted: true });
  const saved = mergeCanvas(doc([el('a', 1)]), doc([deleted]));
  assert.deepEqual(parseCanvas(saved).elements, [deleted]);
});
test('disputa no mesmo objeto converge para a mesma versão em ambos os clientes', () => {
  const a = doc([el('a', 2, 50, { x: 10 })]);
  const b = doc([el('a', 2, 20, { x: 90 })]);
  assert.deepEqual(parseCanvas(mergeCanvas(a, b)).elements, parseCanvas(mergeCanvas(b, a)).elements);
  assert.equal(parseCanvas(mergeCanvas(a, b)).elements[0].x, 90);
});
test('salvamento repetido é idempotente e não gera gravações em loop', async () => {
  const content = doc([el('a')]);
  let writes = 0;
  await saveCanvasSafely(content, { read: async () => ({ conteudo: content, updated_at: '1' }), compareAndSwap: async () => { writes++; return true; } });
  assert.equal(writes, 0);
});
test('falha de rede, excesso de concorrência e conteúdo inválido não são tratados como sucesso', async () => {
  await assert.rejects(saveCanvasSafely(doc([]), { read: async () => { throw Error('offline'); } }));
  await assert.rejects(saveCanvasSafely(doc([el('a')]), { read: async () => ({ conteudo: doc([]), updated_at: '1' }), compareAndSwap: async () => false }));
  assert.throws(() => mergeCanvas(doc([]), '<p>documento de texto</p>'));
});
