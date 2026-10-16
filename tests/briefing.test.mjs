import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/briefing.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { esperandoResposta, segundosEsperando, duracaoCurta, descricaoDaTarefa, prazoValido } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const msg = (papel, texto, status = null, criada_em = '2026-10-14T15:00:00Z') => ({ id: texto, papel, texto, status, criada_em });

test('esperando o funcionário só quando a última é do Davi sem resposta', () => {
  assert.equal(esperandoResposta([]), false);
  assert.equal(esperandoResposta([msg('davi', 'oi', 'enviada')]), true);
  assert.equal(esperandoResposta([msg('davi', 'oi', 'lida')]), true);
  assert.equal(esperandoResposta([msg('davi', 'oi', 'respondida'), msg('funcionario', 'entendi')]), false);
  assert.equal(segundosEsperando([msg('davi', 'oi', 'enviada')], Date.parse('2026-10-14T15:02:00Z')), 120);
  assert.equal(segundosEsperando([msg('funcionario', 'x')], Date.parse('2026-10-14T15:02:00Z')), 0);
});

test('há quanto tempo a IA está respondendo, curto', () => {
  assert.equal(duracaoCurta(0), 'menos de 1 min');
  assert.equal(duracaoCurta(59), 'menos de 1 min');
  assert.equal(duracaoCurta(6 * 60 + 30), '6 min');
  assert.equal(duracaoCurta(34 * 60), '34 min');
  assert.equal(duracaoCurta(65 * 60), '1 h 05 min');
});

test('descrição leva o combinado e a conversa', () => {
  const d = descricaoDaTarefa({
    titulo: 'Mapa de quizzes', entendimento: 'Vou mapear os quizzes que funcionam.', entregas: ['Documento com 10 quizzes'],
    consigo: 'em_parte', limites: 'preciso dos livros', precisa_de: ['subir o $100M Offers'],
  }, [msg('davi', 'Mapeie os quizzes'), msg('funcionario', 'Para qual produto?')], 'Ítalo');
  assert.match(d, /^Combinado com Ítalo/);
  assert.match(d, /- Documento com 10 quizzes/);
  assert.match(d, /Consigo em parte — preciso dos livros/);
  assert.match(d, /- subir o \$100M Offers/);
  assert.match(d, /Davi: Mapeie os quizzes\nÍtalo: Para qual produto\?$/);
});

test('prazo', () => {
  assert.equal(prazoValido('2026-10-20'), true);
  assert.equal(prazoValido('20/10'), false);
  assert.equal(prazoValido(undefined), false);
});
