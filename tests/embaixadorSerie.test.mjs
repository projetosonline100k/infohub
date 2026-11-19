import test from "node:test";
import assert from "node:assert/strict";
import { agrupar, chaveDe, intervalo, rotulo } from "../src/lib/embaixadorSerie.ts";

test("semana começa na segunda e mês no dia 1", () => {
  assert.equal(chaveDe("2026-11-19", "semana"), "2026-11-16");   // quinta → segunda
  assert.equal(chaveDe("2026-11-22", "semana"), "2026-11-16");   // domingo ainda é da semana de 16
  assert.equal(chaveDe("2026-11-23", "semana"), "2026-11-23");
  assert.equal(chaveDe("2026-11-19", "mes"), "2026-11-01");
  assert.equal(chaveDe("2026-11-19", "dia"), "2026-11-19");
});
test("intervalo não tem buracos, nem na virada do mês e do ano", () => {
  assert.deepEqual(intervalo("2026-11-29", "2026-12-02", "dia"), ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  assert.deepEqual(intervalo("2026-11-10", "2026-11-25", "semana"), ["2026-11-09", "2026-11-16", "2026-11-23"]);
  assert.deepEqual(intervalo("2026-11-15", "2027-01-05", "mes"), ["2026-11-01", "2026-12-01", "2027-01-01"]);
});
test("agrupar soma por trecho e completa com zero", () => {
  const linhas = [{ dia: "2026-11-16", vendas: 1, receita: 100 }, { dia: "2026-11-19", vendas: 2, receita: 50 }, { dia: "2026-11-25", vendas: 1, receita: 10 }];
  const sem = agrupar(linhas, "semana", ["vendas", "receita"], "2026-11-09", "2026-11-25");
  assert.deepEqual(sem.map((p) => [p.chave, p.vendas, p.receita]), [["2026-11-09", 0, 0], ["2026-11-16", 3, 150], ["2026-11-23", 1, 10]]);
  assert.equal(agrupar(linhas, "mes", ["vendas"], "2026-10-20", "2026-11-25").map((p) => p.vendas).join(), "0,4");
});
test("rótulos", () => { assert.equal(rotulo("2026-11-16", "semana"), "16/11"); assert.equal(rotulo("2026-12-01", "mes"), "dez/26"); });
