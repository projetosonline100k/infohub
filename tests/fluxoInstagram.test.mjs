import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../supabase/functions/_shared/fluxo.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const f = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const no = (id, tipo, dados = {}) => ({ id, tipo, x: 0, y: 0, dados });
const lig = (de, saida, para) => ({ de, saida, para });
const sim = { id: 'sim', titulo: 'Sim', tipo: 'resposta' }, nao = { id: 'nao', titulo: 'Não', tipo: 'resposta' };
const fluxo = () => ({
  nos: [no('inicio', 'inicio'), no('m1', 'mensagem', { texto: 'Oi! Quer o link?', botoes: [sim, nao] }), no('m2', 'mensagem', { texto: 'Aqui: https://x.co' }), no('w', 'esperar', { minutos: 10 }),
    no('c', 'condicao', { condicao: 'respondeu' }), no('m3', 'mensagem', { texto: 'Conseguiu?' }), no('fim', 'fim')],
  ligacoes: [lig('inicio', 'proximo', 'm1'), lig('m1', 'sim', 'm2'), lig('m1', 'nao', 'fim'), lig('m2', 'proximo', 'w'), lig('w', 'proximo', 'c'), lig('c', 'nao', 'm3'), lig('c', 'sim', 'fim'), lig('m3', 'proximo', 'fim')],
});

test('fluxo válido não tem problemas e começa na primeira mensagem', () => {
  const g = fluxo();
  assert.deepEqual(f.problemasDoFluxo(g), []);
  assert.equal(f.primeiroNo(g).id, 'm1');
});

test('saídas: mensagem com respostas abre uma por botão + "outra resposta"; sem botões só "proximo"', () => {
  const g = fluxo();
  assert.deepEqual(f.saidasDoNo(g.nos[1]).map((s) => s.id), ['sim', 'nao', 'outro']);
  assert.deepEqual(f.saidasDoNo(g.nos[2]).map((s) => s.id), ['proximo']);
  assert.deepEqual(f.saidasDoNo(g.nos[4]).map((s) => s.id), ['sim', 'nao']);
});

test('motor: mensagem com botões espera; espera de tempo agenda; condição segue sim/não', () => {
  const g = fluxo();
  assert.equal(f.aguardaResposta(g.nos[1]), true);
  assert.equal(f.proximoPasso(g, g.nos[3], { respondeu: false, ultimoTexto: '' }).tipo, 'esperar_tempo');
  assert.equal(f.proximoPasso(g, g.nos[3], { respondeu: false, ultimoTexto: '' }).minutos, 10);
  // depois da espera: segue para a condição (a decisão do motor começa no destino da espera)
  const depois = f.destinoDe(g, 'w', 'proximo');
  assert.equal(f.proximoPasso(g, depois, { respondeu: false, ultimoTexto: '' }).no.id, 'm3');   // não respondeu → "Conseguiu?"
  assert.equal(f.proximoPasso(g, depois, { respondeu: true, ultimoTexto: '' }).tipo, 'fim');      // respondeu → fim
});

test('resposta: payload do botão, título digitado e texto livre', () => {
  const m = fluxo().nos[1];
  assert.equal(f.saidaDaResposta(m, 'sim', 'Sim'), 'sim');
  assert.equal(f.saidaDaResposta(m, null, ' não '), 'nao');
  assert.equal(f.saidaDaResposta(m, null, 'talvez depois'), 'outro');
});

test('condição por palavra ignora acento e caixa', () => {
  const c = no('c', 'condicao', { condicao: 'texto_contem', palavra: 'Quero' });
  assert.equal(f.avaliarCondicao(c, { respondeu: true, ultimoTexto: 'QUERO sim!' }), true);
  assert.equal(f.avaliarCondicao(c, { respondeu: true, ultimoTexto: 'nao quero' }), true);
  assert.equal(f.avaliarCondicao(c, { respondeu: true, ultimoTexto: 'queroo' }), false);
});

test('gatilho do fluxo: contém/exata como nas automações', () => {
  assert.equal(f.fluxoBate({ palavras_chave: ['instalivros'], correspondencia: 'contem' }, 'Eu quero INSTALIVROS 🙌'), true);
  assert.equal(f.fluxoBate({ palavras_chave: ['instalivros'], correspondencia: 'exata' }, 'quero instalivros'), false);
});

test('validações: texto vazio, botão grande, link inválido, mistura de botões, espera fora do limite, bloco solto, laço sem pausa', () => {
  const g = fluxo();
  g.nos[2].dados.texto = '  ';
  g.nos[1].dados.botoes[0].titulo = 'x'.repeat(25);
  g.nos[3].dados.minutos = 5000;
  g.nos.push(no('solto', 'mensagem', { texto: 'oi', botoes: [{ id: 'a', titulo: 'ok', tipo: 'link', url: 'ftp://x' }, sim] }));
  const t = f.problemasDoFluxo(g).map((p) => p.texto).join('|');
  assert.ok(t.includes('Mensagem sem texto') && t.includes('passa de 20') && t.includes('1 minuto a 24 horas') && t.includes('Bloco solto') && t.includes('não mistura') && t.includes('https://'));
  const laco = { nos: [no('inicio', 'inicio'), no('a', 'mensagem', { texto: 'a' }), no('b', 'mensagem', { texto: 'b' })], ligacoes: [lig('inicio', 'proximo', 'a'), lig('a', 'proximo', 'b'), lig('b', 'proximo', 'a')] };
  assert.ok(f.problemasDoFluxo(laco).some((p) => p.texto.includes('laço')));
  assert.ok(f.problemasDoFluxo({ nos: [no('inicio', 'inicio')], ligacoes: [] }).some((p) => p.texto.includes('Ligue o início')));
});
