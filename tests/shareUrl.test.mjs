import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/shareUrl.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { publicWebOrigin, documentShareUrl } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('desktop e desenvolvimento usam o endereço público configurado', () => {
  for (const current of ['tauri://localhost', 'http://tauri.localhost', 'http://localhost:8080']) {
    assert.equal(publicWebOrigin('https://hub.example.com/', current), 'https://hub.example.com');
  }
});
test('não compartilha endereços internos nem configuração inválida', () => {
  for (const current of ['tauri://localhost', 'http://localhost:8080', 'https://tauri.localhost', 'https://192.168.1.2', 'https://[::1]', 'invalid']) {
    assert.equal(publicWebOrigin(undefined, current), null);
  }
  assert.equal(publicWebOrigin('invalid', 'https://hub.example.com'), null);
  assert.equal(publicWebOrigin(undefined, 'https://hub.example.com'), 'https://hub.example.com');
});
test('nome legível mantém a rota e o token compatíveis com links antigos', () => {
  const url = new URL(documentShareUrl('https://hub.example.com', 'abc-123', 'Oferta São Paulo!'));
  assert.equal(url.pathname, '/compartilhado/abc-123');
  assert.equal(url.searchParams.get('nome'), 'oferta-sao-paulo');
  assert.equal(new URL(documentShareUrl(url.origin, 'abc-123', 'Novo nome')).pathname, url.pathname);
});
