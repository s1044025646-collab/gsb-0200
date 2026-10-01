import { test } from "node:test";
import assert from "node:assert/strict";
import { lllReduce, checkLLLConditions, verifyTransform, DEFAULT_PARAMS } from "../core/lll";
import { parseIMat, intDet, inorm2 } from "../core/vec";

function mat(rows: number[][]): bigint[][] {
  return parseIMat(rows.map((r) => r.map((x) => x.toString())));
}

test("已约简基：恒等变换，保持约简", () => {
  // Z^2 标准基本身就是 LLL 约简
  const B = mat([[1, 0], [0, 1]]);
  const r = lllReduce(B);
  assert.equal(r.status, "reduced");
  assert.equal(r.swaps, 0);
  assert.equal(intDet(r.U), 1n);
  const v = verifyTransform(r.basis, r.U, B);
  assert.equal(v.transformOk, true);
});

test("严重斜交基：约简后向量变短且生成同一格", () => {
  const B = mat([[1, 100], [1, 101]]);
  const before = inorm2(B[0]);
  const r = lllReduce(B);
  assert.equal(r.status, "reduced");
  const v = verifyTransform(r.basis, r.U, B);
  assert.equal(v.transformOk, true);
  assert.equal(v.detU === 1n || v.detU === -1n, true);
  // 约简基首向量长度平方明显改善
  assert.ok(inorm2(r.basis[0]) <= before);
  const rep = checkLLLConditions(r.basis, 3n, 4n);
  assert.equal(rep.sizeReduced, true);
  assert.equal(rep.lovaszAll, true);
});

test("需要交换的基：发生 swap", () => {
  // 顺序故意倒置，短向量在第二行
  const B = mat([[10, 0], [1, 1]]);
  const r = lllReduce(B);
  assert.equal(r.status, "reduced");
  assert.ok(r.swaps >= 1, "应至少发生一次交换");
  const v = verifyTransform(r.basis, r.U, B);
  assert.equal(v.transformOk, true);
  assert.equal(BigInt(v.detU.toString()) === 1n || BigInt(v.detU.toString()) === -1n, true);
});

test("负坐标基：正确处理", () => {
  const B = mat([[-5, 2], [-3, -7]]);
  const r = lllReduce(B);
  assert.equal(r.status, "reduced");
  const v = verifyTransform(r.basis, r.U, B);
  assert.equal(v.transformOk, true);
});

test("半整数舍入在 LLL 中被触发且确定", () => {
  // 构造使某 mu 恰为 1/2 附近的整数基（例如 [[2,0],[1,2]]: mu_10=1/2）
  const B = mat([[2, 0], [1, 2]]);
  const r1 = lllReduce(B);
  const r2 = lllReduce(B);
  assert.equal(r1.status, "reduced");
  // 确定性：两次结果完全一致
  assert.deepEqual(r1.basis, r2.basis);
  assert.deepEqual(r1.U, r2.U);
});

test("线性相关输入被拒绝并清楚报告", () => {
  const B = mat([[1, 2], [2, 4]]);
  const r = lllReduce(B, DEFAULT_PARAMS);
  assert.equal(r.status, "dependent_input");
  assert.match(r.message, /线性相关/);
});

test("零向量输入被拒绝", () => {
  const B = mat([[0, 0], [1, 1]]);
  const r = lllReduce(B);
  assert.equal(r.status, "zero_vector");
  assert.match(r.message, /零向量/);
});

test("迭代预算耗尽：状态明确，不冒充已约简", () => {
  const B = mat([[1, 10000], [1, 10001]]);
  const r = lllReduce(B, { ...DEFAULT_PARAMS, maxIterations: 0 });
  assert.equal(r.status, "iteration_budget_exhausted");
});

test("自定义合法 delta", () => {
  const B = mat([[1, 100], [1, 101]]);
  const r = lllReduce(B, { ...DEFAULT_PARAMS, deltaNum: 99n, deltaDen: 100n });
  assert.equal(r.status, "reduced");
});
