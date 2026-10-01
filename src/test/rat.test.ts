import { test } from "node:test";
import assert from "node:assert/strict";
import { Rat, rat } from "../core/rat";

test("有理数精确运算", () => {
  const a = rat(2, 3);
  const b = rat(3, 4);
  assert.equal(a.add(b).cmp(rat(17, 12)), 0);
  assert.equal(a.mul(b).cmp(rat(1, 2)), 0);
  assert.equal(a.div(b).cmp(rat(8, 9)), 0);
  assert.equal(Rat.make(6n, -4n).d, 2n);
  assert.equal(Rat.make(6n, -4n).n, -3n);
});

test("最近整数：半整数平局远离零", () => {
  assert.equal(rat(1, 2).nearestIntHalfAway(), 1n);
  assert.equal(rat(-1, 2).nearestIntHalfAway(), -1n);
  assert.equal(rat(3, 2).nearestIntHalfAway(), 2n);
  assert.equal(rat(-3, 2).nearestIntHalfAway(), -2n);
  assert.equal(rat(2, 3).nearestIntHalfAway(), 1n);   // .666 -> 1
  assert.equal(rat(-2, 3).nearestIntHalfAway(), -1n);
  assert.equal(rat(1, 3).nearestIntHalfAway(), 0n);   // .333 -> 0
  assert.equal(rat(-1, 3).nearestIntHalfAway(), 0n);
  assert.equal(rat(5).nearestIntHalfAway(), 5n);
});

test("delta 区间校验", () => {
  const { validateDelta } = require("../core/lll");
  validateDelta(3n, 4n);
  assert.throws(() => validateDelta(1n, 4n));
  assert.throws(() => validateDelta(1n, 1n));
  assert.throws(() => validateDelta(0n, 1n));
});
