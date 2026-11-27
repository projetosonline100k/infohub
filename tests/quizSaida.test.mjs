import test from "node:test";
import assert from "node:assert/strict";
import { comCupom } from "../src/lib/quiz/saida.ts";

test("cupom entra no link da Kiwify, com e sem parâmetros antes", () => {
  assert.equal(comCupom("https://pay.kiwify.com.br/abc", "FICA15"), "https://pay.kiwify.com.br/abc?coupon=FICA15");
  assert.equal(comCupom("https://pay.kiwify.com.br/abc?utm_source=ig", " FICA15 "), "https://pay.kiwify.com.br/abc?utm_source=ig&coupon=FICA15");
});
test("sem cupom ou fora da Kiwify, o link não muda", () => {
  assert.equal(comCupom("https://pay.kiwify.com.br/abc", ""), "https://pay.kiwify.com.br/abc");
  assert.equal(comCupom("https://chk.eduzz.com/abc", "FICA15"), "https://chk.eduzz.com/abc");
  assert.equal(comCupom("https://kiwify.com.br.exemplo.com/abc", "FICA15"), "https://kiwify.com.br.exemplo.com/abc");
});
