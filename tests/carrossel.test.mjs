import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/carrossel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { opcoesDeTitulo, montarPrevia, paginaVisivel, historicoVazio, excluirPagina, desfazerExclusao, refazerExclusao, podeExcluir, precisaRevisar, emProducao, linhaPrecisa, partesDoTitulo, semMarcas, paginasEditadas, montarPedidoAjuste, tarefaDaDalila, acharProgramador } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const car = (extra = {}) => ({
  id: 'c1', numero: 11, tema: '3 documentários', status: 'revisar', mensagem: null, feedback: null,
  slides: [], legenda: 'x', paginas: ['a', 'b', 'c', 'd', 'e', 'f'], versao: 1, fonte_permalink: null,
  pasta_drive: null, atividade_id: null, atualizado_em: '2026-10-14', ...extra,
});

test('revisar e erro pedem o Davi; produzindo e ajuste estão com o Roy', () => {
  assert.equal(precisaRevisar(car()), true);
  assert.equal(precisaRevisar(car({ status: 'erro' })), true);
  assert.equal(precisaRevisar(car({ status: 'aprovado' })), false);
  assert.equal(emProducao(car({ status: 'ajuste' })), true);
  assert.equal(emProducao(car({ status: 'revisar' })), false);
});

test('linha do "Precisa de você" mostra páginas, versão e erro', () => {
  assert.deepEqual(linhaPrecisa(car()), { titulo: 'Revisar carrossel: 3 documentários', detalhe: 'Roy terminou · 6 páginas', problema: false });
  assert.match(linhaPrecisa(car({ versao: 2 })).detalhe, /versão 2/);
  assert.deepEqual(linhaPrecisa(car({ status: 'erro', mensagem: 'sem vídeo' })),
    { titulo: 'Carrossel com problema: 3 documentários', detalhe: 'sem vídeo', problema: true });
});

test('título: *palavra* vira destaque', () => {
  assert.deepEqual(partesDoTitulo('*3* DOCUMENTÁRIOS PARA *VOCÊ*.'), [
    { texto: '3', destaque: true }, { texto: ' DOCUMENTÁRIOS PARA ', destaque: false },
    { texto: 'VOCÊ', destaque: true }, { texto: '.', destaque: false },
  ]);
  assert.equal(semMarcas('*3* DOCUMENTÁRIOS'), '3 DOCUMENTÁRIOS');
});

test('páginas editadas e pedido de ajuste', () => {
  const o = [{ titulo: 'A', texto: 'a', pagina: '01/02' }, { titulo: 'B', texto: 'b', pagina: '02/02' }];
  assert.deepEqual(paginasEditadas(o, o), []);
  assert.deepEqual(paginasEditadas(o, [o[0], { ...o[1], texto: 'novo' }]), [2]);
  assert.deepEqual(paginasEditadas(o, [{ ...o[0], titulo: ' A ' }, o[1]]), []);
  assert.equal(montarPedidoAjuste('Trocar a capa', [2], true), 'Trocar a capa\nTextos editados na tela: página 02.\nLegenda editada na tela.');
  assert.equal(montarPedidoAjuste('', [1, 3], false), 'Textos editados na tela: páginas 01, 03.');
});

test('aprovado vira tarefa da Dalila', () => {
  assert.equal(tarefaDaDalila(car()), 'Programar carrossel: 011 · 3 documentários (6 páginas)');
  const membros = [{ nome: 'Roy', funcao: 'Carrosséis', eh_ia: true }, { nome: 'Ana', funcao: 'Social media', eh_ia: false }];
  assert.equal(acharProgramador(membros).nome, 'Ana');
  assert.equal(acharProgramador([...membros, { nome: 'Dalila', funcao: null, eh_ia: false }]).nome, 'Dalila');
  assert.equal(acharProgramador([membros[0]]), null);
});

test('excluir página: não a última, não abaixo de 6; vai no pedido de ajuste', () => {
  assert.equal(podeExcluir(3, 8, []), null);
  assert.match(podeExcluir(8, 8, []), /última/);
  assert.equal(podeExcluir(3, 8, [2]), null);
  assert.match(podeExcluir(3, 8, [2, 4]), /pelo menos 6/);
  assert.match(podeExcluir(2, 6, []), /pelo menos 6/);
  assert.equal(montarPedidoAjuste('', [], false, [4]), 'Excluir a página 04.');
  assert.equal(montarPedidoAjuste('Capa', [1], false, [3, 5]), 'Capa\nExcluir as páginas 03, 05.\nTextos editados na tela: página 01.');
});

test('páginas excluídas somem da navegação', () => {
  assert.equal(paginaVisivel(3, 8, [4]), 4);          // excluiu a 4 (índice 3): vai pra 5
  assert.equal(paginaVisivel(3, 8, [4], -1), 2);      // voltando: vai pra 3
  assert.equal(paginaVisivel(6, 8, [7, 8]), 5);       // sem próxima: a mais perto antes
  assert.equal(paginaVisivel(0, 8, []), 0);
});

test('⌘Z desfaz e ⌘⇧Z refaz as exclusões, na ordem', () => {
  let h = excluirPagina(excluirPagina(historicoVazio(), 5), 2);
  assert.deepEqual(h.excluidas, [2, 5]);
  let r = desfazerExclusao(h);
  assert.equal(r.pagina, 2); assert.deepEqual(r.h.excluidas, [5]);
  r = refazerExclusao(r.h);
  assert.equal(r.pagina, 2); assert.deepEqual(r.h.excluidas, [2, 5]);
  r = desfazerExclusao(desfazerExclusao(r.h).h);
  assert.equal(r.pagina, 5); assert.deepEqual(r.h.excluidas, []);
  assert.equal(desfazerExclusao(r.h).pagina, null);
  // Excluir outra depois de desfazer apaga o "refazer".
  assert.deepEqual(excluirPagina(r.h, 3).desfeitas, []);
});

test('prévia ao vivo: põe o texto editado no molde, com destaque e sem quebrar o HTML', () => {
  const molde = '<div id="titulo">__TITULO__</div><div id="texto">__TEXTO__</div>';
  assert.equal(montarPrevia(molde, '*3* DOCS <b>', 'Linha 1\nR$ 5 & "mais" $&'),
    '<div id="titulo"><span class="d">3</span> DOCS &lt;b&gt;</div><div id="texto">Linha 1<br>R$ 5 &amp; &quot;mais&quot; $&amp;</div>');
});

test('opções de título: sugestões do Roy + o original, sem o que já está na página', () => {
  const o = { titulo: 'HEADLINE DO *REEL*', texto: '', pagina: '01/07', opcoes: ['CURTA', 'headline do reel', 'OUTRA'] };
  assert.deepEqual(opcoesDeTitulo(o, 'HEADLINE DO *REEL*'), ['CURTA', 'OUTRA']);
  assert.deepEqual(opcoesDeTitulo(o, 'CURTA'), ['HEADLINE DO *REEL*', 'OUTRA']);
  assert.deepEqual(opcoesDeTitulo({ titulo: 'X', texto: '', pagina: '02/07' }, 'X'), []);
});
