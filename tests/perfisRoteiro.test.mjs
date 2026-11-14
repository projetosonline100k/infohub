import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/conteudo/perfisRoteiro.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const p = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('perfil padrão usa a coluna roteiro; os outros, o mapa; perfil novo começa zerado', () => {
  assert.equal(p.roteiroDoPerfil('instalivros', '<p>a</p>', { jaci: '<p>j</p>' }), '<p>a</p>');
  assert.equal(p.roteiroDoPerfil('jaci', '<p>a</p>', { jaci: '<p>j</p>' }), '<p>j</p>');
  assert.equal(p.roteiroDoPerfil('eu_davi', '<p>a</p>', { jaci: '<p>j</p>' }), '');
  assert.equal(p.roteiroDoPerfil('jaci', null, null), '');
});
test('guardar: editar um perfil não mexe nos outros (ao voltar, o que estava escrito aparece)', () => {
  let v = { roteiro: '<p>padrão</p>', roteiros_perfis: { jaci: '<p>jaci</p>' } };
  v = { ...v, ...p.guardarRoteiro('eu_davi', '<p>davi</p>', v) };
  assert.deepEqual(v.roteiros_perfis, { jaci: '<p>jaci</p>', eu_davi: '<p>davi</p>' }); assert.equal(v.roteiro, '<p>padrão</p>');
  v = { ...v, ...p.guardarRoteiro('instalivros', '<p>novo</p>', v) };
  assert.equal(v.roteiro, '<p>novo</p>'); assert.equal(v.roteiros_perfis.jaci, '<p>jaci</p>');
  assert.equal(p.roteiroDoPerfil('eu_davi', v.roteiro, v.roteiros_perfis), '<p>davi</p>');
});
test('quem tem texto: HTML vazio não conta', () => {
  const s = p.perfisComTexto('<p></p>', { jaci: '<p>oi</p>', eu_davi: '<p>&nbsp;</p>' });
  assert.deepEqual([...s], ['jaci']);
  assert.equal(p.perfisComTexto('<p>x</p>', {}).has('instalivros'), true);
});
