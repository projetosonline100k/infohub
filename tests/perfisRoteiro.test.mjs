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

test('cérebro do perfil: acha por id fixo ou por nome conhecido; o "Davi" que já existe serve ao Eu.davi; sem cérebro, nasce em branco', () => {
  const cer = [{ id: 'c1', nome: 'Davi' }, { id: 'c2', nome: 'Cinthia Chiari' }, { id: 'perfil-jaci', nome: 'Qualquer' }];
  assert.equal(p.acharCerebroDoPerfil(cer, { chave: 'eu_davi', nome: 'Eu.davi' }).id, 'c1');
  assert.equal(p.acharCerebroDoPerfil(cer, { chave: 'jaci', nome: 'Jaci' }).id, 'perfil-jaci');
  assert.equal(p.acharCerebroDoPerfil(cer, { chave: 'instalivros', nome: 'Instalivros' }), null);
  const novo = p.novoCerebroDoPerfil({ chave: 'instalivros', nome: 'Instalivros' });
  assert.equal(novo.id, 'perfil-instalivros'); assert.equal(novo.nome, 'Instalivros'); assert.ok(novo.secoes.length >= 4 && novo.secoes.every((x) => x.texto === ''));
  assert.equal(p.acharCerebroDoPerfil([novo, ...cer], { chave: 'instalivros', nome: 'Instalivros' }).id, 'perfil-instalivros');
});
test('headlines para puxar: sem a linha REF, sem link e sem título vazio', () => {
  const r = p.headlinesParaPuxar([{ numero: 1, titulo: 'REF' }, { numero: 2, titulo: '4 livros para sair do modo zumbi' }, { numero: 3, titulo: '' }, { numero: 4, titulo: 'https://x.co/a' }]);
  assert.deepEqual(r.map((h) => h.numero), [2]);
});
