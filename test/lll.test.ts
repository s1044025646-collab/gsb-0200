import { test } from "node:test";
import assert from "node:assert/strict";
import { lllReduce } from "../src/lll";
import { matMul, determinant, parseVec, normSqInt } from "../src/matrix";
import { verifyCertificate } from "../src/verify";
import { frac } from "../src/frac";

const M = (rows: string[][]) => rows.map(parseVec);

function assertValidReduction(rows: string[][]) {
  const basis = M(rows);
  const r = lllReduce(basis);
  assert.equal(r.status, "reduced", r.message);
  assert.equal(r.reduced, true);
  // B' = U B
  assert.deepEqual(matMul(r.U, basis), r.basisPrime);
  // det U = ±1
  const d = determinant(r.U);
  assert.ok(d === 1n || d === -1n, "det U 应为 ±1，实际 " + d);
  // 证书核验通过
  const v = verifyCertificate({
    version: "lll-cert-v1",
    originalBasis: basis,
    reducedBasis: r.basisPrime,
    U: r.U,
    deltaNum: "3",
    deltaDen: "4",
  });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  return r;
}

test("已约简基保持约简", () => {
  const r = assertValidReduction([
    ["1", "0"],
    ["0", "1"],
  ]);
  assert.equal(r.swaps, 0);
});

test("严重斜交基被约简", () => {
  const basis = M([
    ["1", "1000000"],
    ["0", "1"],
  ]);
  const r = assertValidReduction([
    ["1", "1000000"],
    ["0", "1"],
  ]);
  const before = normSqInt(basis[0]);
  const afterMax = Math.max(
    ...r.basisPrime.map((v) => Number(normSqInt(v) <= BigInt(Number.MAX_SAFE_INTEGER) ? normSqInt(v) : BigInt(Number.MAX_SAFE_INTEGER)))
  );
  assert.ok(afterMax < Number(before), "约简后最长向量应显著变短");
});

test("需要交换的基发生交换", () => {
  // 经典 LLL 触发交换的例子
  const r = assertValidReduction([
    ["19", "13"],
    ["8", "17"],
  ]);
  assert.ok(r.swaps >= 1, "应至少交换一次");
});

test("负坐标也正确约简", () => {
  assertValidReduction([
    ["-10", "3"],
    ["7", "-11"],
  ]);
});

test("零向量被清楚报告", () => {
  const r = lllReduce(M([["0", "0"], ["1", "1"]]));
  assert.equal(r.status, "zero-vector");
  assert.equal(r.reduced, false);
});

test("线性相关输入被检测", () => {
  const r = lllReduce(M([
    ["2", "0"],
    ["4", "0"],
  ]));
  assert.equal(r.status, "dependent");
  assert.equal(r.reduced, false);
  assert.ok(r.dependentIndex >= 0);
});

test("迭代预算中断不冒充已约简", () => {
  const big = Array.from({ length: 10 }, (_, i) => {
    const row = new Array(10).fill("0");
    row[i] = String(10 ** 12);
    if (i > 0) row[i - 1] = String(10 ** 12 - 1);
    return row;
  });
  const r = lllReduce(M(big), { iterationBudget: 2 });
  assert.equal(r.status, "iteration-budget-exhausted");
  assert.equal(r.reduced, false);
});

test("非法 delta 被拒绝", () => {
  const r = lllReduce(M([["1", "0"], ["0", "1"]]), {
    delta: frac(1n, 5n),
  });
  assert.equal(r.status, "invalid-input");
  const r2 = lllReduce(M([["1", "0"], ["0", "1"]]), {
    delta: frac(1n, 1n),
  });
  assert.equal(r2.status, "invalid-input");
});
