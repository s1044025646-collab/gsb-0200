import { test } from "node:test";
import assert from "node:assert/strict";
import { lllReduce } from "../core/lll";
import { babaiNearestPlane, enumerateBox, mapCoeffsToOriginal } from "../core/babai";
import { parseIMat, parseIVec, imatMul, ivecToStrings } from "../core/vec";

function mat(rows: number[][]) {
  return parseIMat(rows.map((r) => r.map(String)));
}
function vec(rows: number[]) {
  return parseIVec(rows.map(String));
}

test("Babai 点在格内且两组基表示一致", () => {
  const B0 = mat([[1, 100], [1, 101]]);
  const r = lllReduce(B0);
  assert.equal(r.status, "reduced");
  const t = vec([4, 250]);
  const bab = babaiNearestPlane(r.basis, t);
  const cR = bab.reducedCoeffs.map(BigInt);
  const cO = mapCoeffsToOriginal(cR, r.U);
  // c' B'
  const viaReduced = imatMul([cR], r.basis)[0];
  // (c' U) B0
  const viaOriginal = imatMul([cO], B0)[0];
  assert.deepEqual(viaReduced.map(String), bab.point.map(String));
  assert.deepEqual(viaReduced, viaOriginal);
  assert.deepEqual(viaOriginal.map(String), bab.point.map(String));
});

test("有限盒对照：盒内最优被识别，且不宣称全局最优", () => {
  const B0 = mat([[1, 100], [1, 101]]);
  const r = lllReduce(B0);
  const t = vec([0, 50]);
  const bab = babaiNearestPlane(r.basis, t);
  const box = enumerateBox(r.basis, t, 3, bab);
  assert.ok(box.combos === 49);
  assert.equal(typeof box.babaiIsBoxOptimal, "boolean");
  assert.match(box.note, /不代表整个格/);
});

test("存在 Babai 近似非最近点的反例（确定性穷举发现）", () => {
  // 已知反例基（2 维，δ=3/4 约简后仍使最近平面贪心出错）
  const B0 = mat([[5, 3], [3, 5]]);
  const r = lllReduce(B0);
  assert.equal(r.status, "reduced");
  const target = vec([-6, 2]);
  const bab = babaiNearestPlane(r.basis, target);
  const box = enumerateBox(r.basis, target, 8, bab);
  const counterexample = {
    target: [-6, 2],
    babaiDist2: `${bab.distanceSqRat.num}/${bab.distanceSqRat.den}`,
    exactDist2: `${box.bestDistanceSqRat.num}/${box.bestDistanceSqRat.den}`,
  };
  assert.ok(counterexample, "应至少找到一个 Babai 非最近点的目标");
  assert.equal(box.babaiIsBoxOptimal, false);
  assert.equal(counterexample.babaiDist2, "10/1");
  assert.equal(counterexample.exactDist2, "8/1");
});

test("负坐标目标的 Babai", () => {
  const B0 = mat([[3, 0], [1, 2]]);
  const r = lllReduce(B0);
  const t = vec([-5, -3]);
  const bab = babaiNearestPlane(r.basis, t);
  assert.equal(Array.isArray(bab.reducedCoeffs), true);
  assert.equal(bab.point.length, 2);
  assert.ok(ivecToStrings(bab.point).every((s) => /^-?\d+$/.test(s)));
});
