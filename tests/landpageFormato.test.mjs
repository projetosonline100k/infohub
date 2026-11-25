import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/landpage/formato.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: '__nada__' } });
const f = await import(`data:text/javascript;base64,${Buffer.from(outputText.replace(/import .*__nada__.*;\n/g, 'const _jsx = () => null;\n').replace(/_jsx\w*/g, '_jsx')).toString('base64')}`);

test('aplicarMarca coloca, tira e ignora sem seleção', () => {
  assert.deepEqual(f.aplicarMarca('um texto bom', 3, 8, 'grifo'), { texto: 'um ==texto== bom', ini: 5, fim: 10 });
  assert.equal(f.aplicarMarca('um ==texto== bom', 5, 10, 'grifo').texto, 'um texto bom');   // selecionou só o miolo: tira
  assert.equal(f.aplicarMarca('um ==texto== bom', 3, 12, 'grifo').texto, 'um texto bom');   // selecionou com as marcas: tira
  assert.equal(f.aplicarMarca('abc', 1, 1, 'menor').texto, 'abc');
  assert.equal(f.aplicarMarca('abc def', 4, 7, 'menor').texto, 'abc ^^def^^');
  assert.equal(f.aplicarMarca('abc def', 0, 3, 'negrito').texto, '**abc** def');
});
