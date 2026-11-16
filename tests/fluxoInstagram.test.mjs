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

test('gatilho do fluxo por trecho', () => {
  assert.equal(f.fluxoBate({ palavras_chave: ['insta'], correspondencia: 'trecho' }, 'instalivors'), true);
  assert.equal(f.fluxoBate({ palavras_chave: ['insta'], correspondencia: 'contem' }, 'instalivors'), false);
  assert.equal(f.fluxoBate({ palavras_chave: ['insta'], correspondencia: 'trecho' }, 'bom dia'), false);
});

test('modo WhatsApp: sem as regras da Meta e com espera de até 7 dias', () => {
  const g = {
    nos: [{ id: 'inicio', tipo: 'inicio', x: 0, y: 0, dados: {} },
      { id: 'm1', tipo: 'mensagem', x: 1, y: 0, dados: { texto: 'a'.repeat(1200), botoes: [{ id: 'b1', titulo: 'Um título bem comprido demais para a Meta', tipo: 'resposta' }] } },
      { id: 'e1', tipo: 'esperar', x: 2, y: 0, dados: { minutos: 3 * 24 * 60 } }],
    ligacoes: [{ de: 'inicio', saida: 'proximo', para: 'm1' }, { de: 'm1', saida: 'b1', para: 'e1' }],
  };
  assert.ok(f.problemasDoFluxo(g).length >= 2);                       // Instagram recusa: texto longo, título longo, espera > 24 h
  assert.deepEqual(f.problemasDoFluxo(g, { whatsapp: true }), []);   // WhatsApp aceita
  g.nos[2].dados.minutos = 8 * 24 * 60;
  assert.ok(f.problemasDoFluxo(g, { whatsapp: true }).some((p) => p.texto.includes('7 dias')));
});

test('bloco Mídia: precisa do arquivo, anda para o próximo e não pode abrir o fluxo do Instagram', () => {
  const g = { nos: [{ id: 'inicio', tipo: 'inicio', x: 0, y: 0, dados: {} }, { id: 'md', tipo: 'midia', x: 1, y: 0, dados: {} }], ligacoes: [{ de: 'inicio', saida: 'proximo', para: 'md' }] };
  const t = f.problemasDoFluxo(g).map((p) => p.texto).join('|');
  assert.match(t, /Escolha o arquivo/); assert.match(t, /primeira mensagem/);
  assert.ok(!f.problemasDoFluxo(g, { whatsapp: true }).some((p) => /primeira mensagem/.test(p.texto)));   // no WhatsApp pode abrir com mídia
  g.nos[1].dados = { midia_url: 'https://x.co/a.png', midia_tipo: 'imagem' };
  assert.ok(!f.problemasDoFluxo(g, { whatsapp: true }).some((p) => /arquivo/.test(p.texto)));
  assert.deepEqual(f.saidasDoNo(g.nos[1]).map((s) => s.id), ['proximo']);
  assert.equal(f.aguardaResposta(g.nos[1]), false);
  const h = { nos: [...g.nos, { id: 'm2', tipo: 'mensagem', x: 2, y: 0, dados: { texto: 'oi' } }], ligacoes: [...g.ligacoes, { de: 'md', saida: 'proximo', para: 'm2' }] };
  assert.equal(f.proximoPasso(h, h.nos[1], { respondeu: false, ultimoTexto: '' }).tipo, 'enviar');   // a mídia é enviada como uma mensagem
});
