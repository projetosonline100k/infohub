import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/youtube.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { tituloDoShort, problemaNoTitulo, retornoDoYoutube, LIMITE_TITULO_SHORT } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('título do Short: headline do reel, sem < >, até 100 caracteres', () => {
  assert.equal(tituloDoShort('  4 hábitos  diários <que> mudam  '), '4 hábitos diários que mudam');
  const longo = tituloDoShort('a'.repeat(150));
  assert.equal(longo.length, LIMITE_TITULO_SHORT);
  assert.equal(problemaNoTitulo(longo), null);
});

test('problemas no título batem com o banco', () => {
  assert.match(problemaNoTitulo('   '), /Escreva/);
  assert.match(problemaNoTitulo('a'.repeat(101)), /100/);
  assert.match(problemaNoTitulo('a <b>'), /< ou >/);
  assert.equal(problemaNoTitulo('Rotina do super soldado'), null);
});

test('volta do login Google', () => {
  assert.equal(retornoDoYoutube('?youtube=conectado').ok, true);
  assert.deepEqual(retornoDoYoutube('?youtube=erro&mensagem=Permiss%C3%A3o%20recusada'), { ok: false, mensagem: 'Permissão recusada' });
  assert.equal(retornoDoYoutube('?google_calendar=connected'), null);
});
