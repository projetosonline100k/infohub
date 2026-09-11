import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/equipe.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { acessoProprietario, resolverAcesso, areasEquipe } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function assertFullAccess(result) {
  assert.equal(result.proprietario, true);
  for (const { id } of areasEquipe) assert.deepEqual(result.permissoes[id], { acessar: true, criar: true, editar: true });
}

test('proprietário tem acesso total antes de consultar permissões', () => {
  assertFullAccess(acessoProprietario('owner', 'owner'));
});
test('RPC ausente ou resposta restritiva não reduz acesso do proprietário', () => {
  for (const data of [null, undefined, {}, { proprietario: false, permissoes: {} }]) {
    assertFullAccess(resolverAcesso('owner', 'owner', data));
  }
});
test('propriedade confirmada pelo banco concede todas as permissões', () => {
  assertFullAccess(resolverAcesso(null, 'owner', { proprietario: true, permissoes: {} }));
});
test('membro recebe somente as permissões delegadas', () => {
  const acesso = resolverAcesso('owner', 'member', { proprietario: false, permissoes: { documentos: { acessar: true, editar: false, criar: false } } });
  assert.equal(acesso.proprietario, false);
  assert.deepEqual(acesso.permissoes.documentos, { acessar: true, criar: false, editar: false });
  assert.equal(acesso.permissoes.conteudo.acessar, false);
  assert.equal(resolverAcesso('owner', 'member', null), null);
});
test('registro sem proprietário e sessão ausente não viram administradores', () => {
  for (const owner of [null, undefined, '']) assert.equal(acessoProprietario(owner, 'user'), null);
  assert.equal(acessoProprietario('owner', undefined), null);
  assert.equal(resolverAcesso(null, 'user', null), null);
});
