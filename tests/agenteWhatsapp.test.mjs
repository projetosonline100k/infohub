import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/agenteWhatsapp.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('vazia: 0% e tudo por fazer; não está pronta', () => {
  const c = m.configVazia();
  const r = m.completude(c);
  assert.equal(r.pct, 0); assert.equal(r.faltando.length, 10); assert.equal(m.prontoParaUsar(c), false);
});
test('sanitizar: aceita o que o Claude devolveu e mantém o resto', () => {
  const atual = m.configVazia(); atual.produto.nome = 'Instalivros'; atual.pode = ['responder dúvidas'];
  const r = m.sanitizarAgente({
    produto: { descricao: ' Resumos de livros ', para_quem: 'quem não tem tempo' },
    ofertas: [{ nome: 'Plano anual', preco: 'R$ 97', link: 'https://chk.eduzz.com/x' }, { nome: '', preco: '1' }, { nome: 'Golpe', link: 'javascript:alert(1)' }],
    objetivo: 'levar ao checkout', nao_pode: ['prometer resultado', '', 5], objecoes: [{ objecao: 'Tá caro', resposta: 'Dá menos de R$ 0,30 por dia' }],
  }, atual);
  assert.equal(r.produto.nome, 'Instalivros'); assert.equal(r.produto.descricao, 'Resumos de livros');
  assert.equal(r.ofertas.length, 2); assert.equal(r.ofertas[0].link, 'https://chk.eduzz.com/x'); assert.equal(r.ofertas[1].link, '');   // link estranho é ignorado
  assert.deepEqual(r.pode, ['responder dúvidas']);   // não veio: mantém
  assert.deepEqual(r.nao_pode, ['prometer resultado']);
  assert.equal(r.objecoes[0].objecao, 'Tá caro');
  assert.deepEqual(m.sanitizarAgente(null, atual), atual);
});
test('completude e quando está pronto', () => {
  const c = m.configVazia();
  c.produto = { nome: 'X', descricao: 'd', para_quem: 'p', resultado: 'r' };
  c.ofertas = [{ nome: 'A', preco: 'R$ 97', link: 'https://x.co', condicoes: '', bonus: '', garantia: '' }];
  c.objetivo = 'vender'; c.nao_pode = ['prometer cura'];
  assert.equal(m.prontoParaUsar(c), true);
  const r = m.completude(c);
  assert.equal(r.pct, 50);   // produto, para quem, oferta, objetivo, não pode
  assert.ok(r.faltando.includes('o tom de voz') && r.faltando.includes('quando chamar você'));
});
