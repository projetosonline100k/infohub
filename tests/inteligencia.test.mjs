import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/inteligencia.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { chaveAgente, tipoDoArquivo, nomeSeguro, tituloSemExtensao, separarPorAlcance, resumo, tamanhoLegivel } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('mesmo funcionário em projetos diferentes = mesma chave', () => {
  assert.equal(chaveAgente(' Ítalo '), 'ítalo');
  assert.equal(chaveAgente('Ítalo'), chaveAgente('ítalo'));
});

test('tipo pelo arquivo', () => {
  assert.equal(tipoDoArquivo('Oferta 100M.PDF'), 'pdf');
  assert.equal(tipoDoArquivo('notas.md'), 'texto');
  assert.equal(tipoDoArquivo('aula.mov'), 'video');
  assert.equal(tipoDoArquivo('x', 'audio/mpeg'), 'video');
  assert.equal(tipoDoArquivo('planilha.xlsx'), null);
});

test('nome seguro e título', () => {
  assert.equal(nomeSeguro('Palavras que Vendem (2ª ed).pdf'), 'palavras-que-vendem-2-ed.pdf');
  assert.equal(nomeSeguro('///'), 'arquivo');
  assert.equal(tituloSemExtensao('Oferta de 100M.pdf'), 'Oferta de 100M');
});

test('projeto novo chega zerado: só vê o geral + o dele', () => {
  const item = (id, escopo, cliente_id, status = 'pronto', caracteres = 2500) => ({ id, escopo, cliente_id, status, caracteres });
  const itens = [item('livro', 'geral', 'davi'), item('voz-davi', 'projeto', 'davi'), item('voz-matheus', 'projeto', 'matheus'), item('aula', 'geral', 'davi', 'pendente', 0)];
  const { geral, projeto } = separarPorAlcance(itens, 'matheus');
  assert.deepEqual(geral.map((i) => i.id), ['livro', 'aula']);
  assert.deepEqual(projeto.map((i) => i.id), ['voz-matheus']);
  assert.deepEqual(resumo([...geral, ...projeto]), { prontos: 2, pendentes: 1, erros: 0, caracteres: 5000 });
  assert.equal(tamanhoLegivel(0), '');
  assert.equal(tamanhoLegivel(100), '≈ 1 página');
  assert.equal(tamanhoLegivel(500000), '≈ 200 páginas');
});
