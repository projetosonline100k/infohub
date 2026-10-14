import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/edicaoVideo.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { trechosMantidos, paraFinal, paraBruto, cortarTrecho, restaurar, duracaoFinal } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Bruto de 20 s com pausa de gravação removida em 5–8 s.
const proj = () => ({ duracao_fonte: 20, remocoes: [{ id: 'auto0', inicio: 5, fim: 8, origem: 'auto' }], legendas: [], midias: [] });

test('trechos mantidos e duração final', () => {
  const segs = trechosMantidos(proj());
  assert.deepEqual(segs, [[0, 5], [8, 20]]);
  assert.equal(duracaoFinal(segs), 17);
});

test('converte tempo bruto ↔ final (e encosta quando cai num corte)', () => {
  const segs = trechosMantidos(proj());
  assert.equal(paraFinal(segs, 10), 7);
  assert.equal(paraBruto(segs, 7), 10);
  assert.equal(paraFinal(segs, 6, 'inicio'), 5);   // dentro do corte → começo do trecho seguinte
  assert.equal(paraFinal(segs, 6, 'fim'), 5);      // → fim do anterior
});

test('cortar no vídeo final vira remoção no bruto, mesmo atravessando um corte', () => {
  const p = cortarTrecho(proj(), 4, 6);             // final 4–6 = bruto 4–5 + 8–9
  const davi = p.remocoes.filter((r) => r.origem === 'davi').map((r) => [r.inicio, r.fim]);
  assert.deepEqual(davi, [[4, 5], [8, 9]]);
  assert.equal(duracaoFinal(trechosMantidos(p)), 15);
});

test('restaurar devolve o trecho (inclusive pausa cortada pelo Danilo)', () => {
  const p = restaurar(proj(), 'auto0');
  assert.equal(duracaoFinal(trechosMantidos(p)), 20);
});

test('linha do tempo: aparar, trazer de volta e clipes da lâmina', async () => {
  const src = readFileSync(new URL('../src/lib/empresa/edicaoVideo.ts', import.meta.url), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = await import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`);
  // Aparar o fim do 1º trecho (bruto 4–5) e depois trazer de volta 4,5–5.
  let p = m.removerIntervalo(proj(), 4, 5);
  assert.deepEqual(m.trechosMantidos(p), [[0, 4], [8, 20]]);
  p = m.restaurarIntervalo(p, 4.5, 5);
  assert.deepEqual(m.trechosMantidos(p), [[0, 4], [4.5, 5], [8, 20]]);
  // Trazer de volta um pedaço do meio de uma remoção do Danilo (6–7 de 5–8).
  const q = m.restaurarIntervalo(proj(), 6, 7);
  assert.deepEqual(m.trechosMantidos(q), [[0, 5], [6, 7], [8, 20]]);
  // Lâmina em 12 e 15: o trecho 8–20 vira 3 clipes, posições no final certas.
  const c = m.clipes(proj(), [12, 15]);
  assert.deepEqual(c.map((k) => [k.inicio, k.fim, k.posFinal]), [[0, 5, 0], [8, 12, 5], [12, 15, 9], [15, 20, 12]]);
  assert.equal(m.remocaoEm(proj(), 6).id, 'auto0');
  assert.equal(m.remocaoEm(proj(), 9), null);
});

test('apagar sem juntar deixa buraco; fechar o buraco junta', async () => {
  const m = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(new URL('../src/lib/empresa/edicaoVideo.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
  let p = m.apagarIntervalo(proj(), 10, 12, false);
  assert.equal(m.duracaoFinal(m.trechosMantidos(p)), 17);           // tempo não muda
  assert.equal(m.lacunaEm(p, 11).inicio, 10);
  const c = m.clipes(p, []);
  assert.deepEqual(c.map((k) => [k.inicio, k.fim, !!k.lacuna]), [[0, 5, false], [8, 10, false], [10, 12, true], [12, 20, false]]);
  p = m.fecharLacuna(p, c[2].lacuna);
  assert.equal(m.duracaoFinal(m.trechosMantidos(p)), 15);
  assert.equal(m.lacunaEm(p, 11), null);
  // Juntar direto
  assert.equal(m.duracaoFinal(m.trechosMantidos(m.apagarIntervalo(proj(), 10, 12, true))), 15);
  // Trazer de volta tira o buraco também
  assert.equal(m.restaurarIntervalo(m.apagarIntervalo(proj(), 10, 12, false), 9, 13).lacunas.length, 0);
});

test('lâmina na legenda divide pelas palavras ditas', async () => {
  const m = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(new URL('../src/lib/empresa/edicaoVideo.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
  const p = { ...proj(), legendas: [{ id: 'L', inicio: 1, fim: 4, texto: 'um dois três', tipo: 'leg' }],
    palavras: [{ t: 'um', s: 1, e: 1.5 }, { t: 'dois', s: 1.6, e: 2.2 }, { t: 'três', s: 3, e: 3.8 }] };
  const q = m.dividirLegenda(p, 'L', 2.5);
  assert.deepEqual(q.legendas.map((l) => [l.inicio, l.fim, l.texto]), [[1, 2.5, 'um dois'], [2.5, 4, 'três']]);
});

test('zoom antigo (pontos) vira blocos e o nível segue a curva', async () => {
  const m = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(new URL('../src/lib/empresa/edicaoVideo.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
  const b = m.blocosZoom({ duracao_fonte: 60, zoom: [{ t: 20, z: 1.08, d: 2.6 }, { t: 35, z: 1, d: 2.6 }, { t: 41, z: 1.13, d: 0 }, { t: 44, z: 1, d: 1.2 }] });
  assert.deepEqual(b.map((x) => [x.inicio, x.fim, x.z, x.tipo]), [[20, 37.6, 1.08, 'suave'], [41, 44, 1.13, 'seco']]);
  const f = [{ a: 0, b: 10, z: 1.2, tipo: 'suave' }];
  assert.equal(m.zoomNoFinal(f, 5), 1.2);
  assert.equal(m.zoomNoFinal(f, 0), 1);
  assert.equal(m.zoomNoFinal(f, 11), 1);
  assert.ok(m.zoomNoFinal(f, 0.6) > 1 && m.zoomNoFinal(f, 0.6) < 1.2);
});
