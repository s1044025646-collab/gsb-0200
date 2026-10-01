import { test } from "node:test";
import assert from "node:assert/strict";
import { frac, roundNearest, add, mul, toDecimal } from "../src/frac";

test("有理数精确运算不约分成浮点", () => {
  const a = frac(1n, 3n);
  const b = frac(1n, 6n);
  assert.equal(toDecimal(add(a, b)), "0.5");
  assert.equal(toDecimal(mul(a, b)), "0.0(5)"); // 1/18 = 0.0555...
});

test("半整数平局向远离 0 舍入（确定性）", () => {
  assert.equal(roundNearest(frac(5n, 2n)).q, 3n); // +2.5 -> +3
  assert.equal(roundNearest(frac(-5n, 2n)).q, -3n); // -2.5 -> -3
  assert.equal(roundNearest(frac(3n, 2n)).q, 2n);
  assert.equal(roundNearest(frac(-3n, 2n)).q, -2n);
  assert.equal(roundNearest(frac(7n, 3n)).q, 2n); // 2.33 -> 2
  assert.equal(roundNearest(frac(-7n, 3n)).q, -2n);
  assert.equal(roundNearest(frac(4n)).q, 4n);
  const t = roundNearest(frac(1n, 2n));
  assert.equal(t.tie, true);
  assert.equal(t.q, 1n);
});
