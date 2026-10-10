import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/traducao.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { dividirTexto, lerResposta, ehPortugues } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('divide em pedaços sem cortar frases', () => {
  const partes = dividirTexto('Uma frase. Outra frase! Mais uma?', 20);
  assert.deepEqual(partes, ['Uma frase.', 'Outra frase!', 'Mais uma?']);
  assert.deepEqual(dividirTexto('Curto. Texto.'), ['Curto. Texto.']);
  assert.equal(dividirTexto('a'.repeat(45), 20).length, 3);
});

test('lê tradução e idioma da resposta do Google', () => {
  const dados = [[['5 tópicos ', '5 temas ', null], ['que estudar', 'que estudiar', null]], null, 'es'];
  assert.deepEqual(lerResposta(dados), { texto: '5 tópicos que estudar', idioma: 'es' });
  assert.deepEqual(lerResposta(null), { texto: '', idioma: null });
});

test('reconhece português', () => {
  assert.equal(ehPortugues('pt'), true);
  assert.equal(ehPortugues('pt-BR'), true);
  assert.equal(ehPortugues('es'), false);
  assert.equal(ehPortugues(null), false);
});
