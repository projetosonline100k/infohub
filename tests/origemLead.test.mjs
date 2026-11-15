import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const ler = (f) => ts.transpileModule(readFileSync(new URL(`../src/lib/quiz/${f}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const afi = ler('afiliados').replace(/import type .*\n/g, '').replace(/^import .*\n/gm, '');
const dentro = ler('origem').replace(/import type .*\n/g, '').replace(/import \{ codigoDaMarca \} from "\.\/afiliados";\n/, '');
const m = await import(`data:text/javascript;base64,${Buffer.from(afi + '\n' + dentro).toString('base64')}`);

const nomes = new Map([['sergio', 'Sergio']]);

test('afiliado: pelo utm_content aff_<código>, com o nome cadastrado', () => {
  const o = m.origemDoLead({ utm_source: 'afiliado', utm_medium: 'reels', utm_campaign: 'instalivros', utm_content: 'aff_sergio' }, nomes);
  assert.equal(o.tipo, 'afiliado'); assert.equal(o.rotulo, 'Afiliado: Sergio'); assert.equal(o.detalhe, 'reels');
  assert.equal(m.origemDoLead({ utm_content: 'aff_sergio', utm_medium: 'link' }, nomes).detalhe, '');
  assert.match(m.origemDoLead({ utm_content: 'aff_fulano' }, nomes).rotulo, /fulano/);
});

test('link da conta: origem · meio, com a campanha no detalhe', () => {
  const o = m.origemDoLead({ utm_source: 'instagram', utm_medium: 'reels', utm_campaign: 'instalivrosapp', utm_content: 'v2' }, nomes);
  assert.equal(o.tipo, 'link'); assert.equal(o.rotulo, 'instagram · reels'); assert.equal(o.detalhe, 'instagram · reels · instalivrosapp · v2');
});

test('sem UTM: direto', () => {
  assert.equal(m.origemDoLead(null, nomes).tipo, 'direto');
  assert.equal(m.origemDoLead({}, nomes).rotulo, 'Direto');
});
